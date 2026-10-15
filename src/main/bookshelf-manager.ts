import { app } from 'electron'
import Store from 'electron-store'
import { join, resolve, sep } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import type {
  BookMeta,
  BookData,
  ReadingProgress,
  Chapter,
  ChapterContent,
  ReaderOpenResult,
  SearchResult,
  Bookmark,
  BookmarkInput,
  LibraryItem,
  MoyuBackup
} from '../shared/types'
import { MAX_TITLE_LENGTH } from '../shared/constants'
import { findChapterIndexForOffset, getChapterType } from '../shared/chapter-patterns'
import { ChapterParser, CHAPTER_PARSER_VERSION } from './chapter-parser'
import { ProgressStore } from './progress-store'

/**
 * 正文存储策略。
 *
 * 之前只有 >5MB 的书才落盘，小书正文塞进 electron-store 的 fileContents
 * 这个 Record 里。每导入一本小书都要把**之前所有书的正文**重新序列化写一遍
 * （10 本书就是几百 MB 的 JSON 反复读写），删除、备份快照同理。
 * 现在正文一律存成独立文件，store 里只留元数据。
 */

/** electron-store schema（只存元数据，不存正文与进度） */
interface StoreSchema {
  books: BookMeta[]
  /** 旧版本内联保存的正文；仅在迁移时读取，迁移后清空 */
  fileContents: Record<string, string>
  /** 旧版本保存的阅读进度；仅在迁移时读取，迁移后清空 */
  progress: Record<string, ReadingProgress>
  bookmarks: Record<string, Bookmark[]>
  /** 旧版本保存的最后阅读时间；仅在迁移时读取，迁移后清空 */
  lastReadAt: Record<string, number>
}

interface StoreSnapshot {
  books: BookMeta[]
  fileContents: Record<string, string>
  bookmarks: Record<string, Bookmark[]>
}

interface ChapterMigration {
  bookId: string
  previousChapters: Chapter[]
  nextChapters: Chapter[]
}

interface HydratedBooksResult {
  books: BookMeta[]
  changed: boolean
  migrations: ChapterMigration[]
}

/**
 * 书架管理器
 * 负责小说列表管理和数据持久化
 */
export class BookshelfManager {
  private store: Store<StoreSchema>
  private progressStore: ProgressStore
  private booksDir: string
  private readonly chapterParser = new ChapterParser()

  constructor(store?: Store<StoreSchema>, progressStore?: ProgressStore) {
    this.store = store ?? new Store<StoreSchema>({
      name: 'bookshelf',
      defaults: {
        books: [],
        fileContents: {},
        progress: {},
        bookmarks: {},
        lastReadAt: {}
      }
    })

    // 大文件存储目录
    this.booksDir = join(app.getPath('userData'), 'books')
    if (!existsSync(this.booksDir)) {
      mkdirSync(this.booksDir, { recursive: true })
    }

    // 阅读进度独立成小文件：它写入频繁，而 electron-store 每次 set 都会
    // 重写整个 store（含全部章节元数据），大书架上会造成秒级同步阻塞。
    this.progressStore =
      progressStore ?? new ProgressStore(app.getPath('userData'))
    this.migrateLegacyProgress()
  }

  /**
   * 把旧版本存在 electron-store 里的阅读进度迁移到独立文件。
   *
   * 只在旧数据存在时执行一次；迁移成功后清空 store 里的旧字段，
   * 避免这部分数据继续参与每次全量序列化。
   */
  private migrateLegacyProgress(): void {
    const legacyProgress = this.store.get('progress', {})
    const legacyLastReadAt = this.store.get('lastReadAt', {})
    const hasProgress = isRecord(legacyProgress) && Object.keys(legacyProgress).length > 0
    const hasLastReadAt = isRecord(legacyLastReadAt) && Object.keys(legacyLastReadAt).length > 0

    if (!hasProgress && !hasLastReadAt) return

    // 旧数据里的 lastReadAt 也可能写在 books[i] 上，一并合并。
    const merged: Record<string, number> = { ...(legacyLastReadAt as Record<string, number>) }
    for (const book of this.store.get('books', [])) {
      if (merged[book.id] === undefined && typeof book.lastReadAt === 'number') {
        merged[book.id] = book.lastReadAt
      }
    }

    try {
      this.progressStore.replace(legacyProgress as Record<string, ReadingProgress>, merged)
      this.store.set({ progress: {}, lastReadAt: {} })
    } catch {
      // 迁移失败时保留旧数据，下次启动再试。
    }
  }

  /** 获取所有书籍元数据 */
  getAllBooks(): BookMeta[] {
    const books = this.store.get('books', [])
    const hydratedBooks = this.hydrateStoredChapterTitles(books)
    if (hydratedBooks.changed) {
      this.store.set('books', hydratedBooks.books)
      this.migrateChapterReferences(hydratedBooks.migrations)
    }
    return this.applyLastReadAt(hydratedBooks.books)
  }

  /**
   * 把 lastReadAt 合并回书籍元数据。
   *
   * lastReadAt 存在独立的小文件里（见 ProgressStore），这里读回来补上，
   * 对调用方保持 BookMeta 形状不变；books 里遗留的旧值作为回退。
   */
  private applyLastReadAt(books: BookMeta[]): BookMeta[] {
    const lastReadAt = this.progressStore.getAllLastReadAt()
    if (Object.keys(lastReadAt).length === 0) return books

    return books.map((book) => {
      const stored = lastReadAt[book.id]
      return typeof stored === 'number' ? { ...book, lastReadAt: stored } : book
    })
  }

  /**
   * 一次性返回书架条目：书籍元数据 + 阅读进度。
   *
   * 书架视图需要每本书的进度，早期实现是渲染进程对每本书各发一次
   * getProgress，书一多就是 N+1 次 IPC 往返。这里在同一个进程内一次性拼好，
   * 只走一次 IPC。
   */
  getLibrary(): LibraryItem[] {
    const progress = this.progressStore.getAllProgress()
    return this.getAllBooks().map((book) => ({
      book,
      progress: progress[book.id] ?? null
    }))
  }

  /** 添加书籍到书架 */
  addBook(bookData: BookData, chapters: Chapter[]): BookMeta {
    const id = randomUUID()
    const now = Date.now()
    const snapshot = this.createStoreSnapshot()
    let contentWritten = false

    const meta: BookMeta = {
      id,
      title: bookData.fileName,
      filePath: bookData.filePath,
      fileSize: bookData.fileSize,
      chapters,
      chapterParserVersion: CHAPTER_PARSER_VERSION,
      addedAt: now,
      lastReadAt: now
    }

    try {
      // 先持久化正文，再提交元数据。异常时回滚，避免书架指向不存在的正文。
      this.writeBookContentFile(id, bookData.content)
      contentWritten = true

      const books = this.store.get('books', [])
      books.push(meta)
      this.store.set('books', books)

      return meta
    } catch (error) {
      if (contentWritten) {
        this.removeBookContentFileIfExists(id)
      }
      this.restoreStoreSnapshot(snapshot)
      throw error
    }
  }

  /** 删除书籍 */
  removeBook(bookId: string): void {
    const books = this.store.get('books', [])
    const bookIndex = books.findIndex((b) => b.id === bookId)
    if (bookIndex === -1) return

    const snapshot = this.createStoreSnapshot()
    const nextBooks = books.filter((b) => b.id !== bookId)
    const bookmarks = this.store.get('bookmarks', {})
    delete bookmarks[bookId]

    try {
      this.store.set({ bookmarks, books: nextBooks })
      // 进度存在独立文件里，单独删除（失败不回滚元数据：残留的进度记录
      // 只会让已删除的书在进度表里多占一条，不影响可读性）。
      this.progressStore.remove(bookId)

      // 正文最后删除：若删除失败，可回滚元数据，避免书籍不可读。
      this.removeBookContentFile(bookId)
    } catch (error) {
      this.restoreStoreSnapshot(snapshot)
      throw error
    }
  }

  /** 更新阅读进度 */
  updateProgress(bookId: string, progress: ReadingProgress): void {
    const books = this.store.get('books', [])
    const bookIndex = books.findIndex((b) => b.id === bookId)
    if (bookIndex === -1) return
    this.assertValidProgress(progress, books[bookIndex])

    // 进度写在独立的小文件里，写入量与书架规模无关。
    // 若放进 electron-store，每次 set 都要把整个 store（含所有章节元数据）
    // 重新序列化并原子落盘，大书架上实测单次阻塞 700ms 以上。
    this.progressStore.updateProgress(bookId, progress, Date.now())
  }

  /** 获取阅读进度 */
  getProgress(bookId: string): ReadingProgress | null {
    return this.progressStore.getProgress(bookId)
  }

  /** 打开书籍：返回元数据、阅读进度和当前章节正文 */
  openBook(bookId: string): ReaderOpenResult | null {
    const book = this.getBookMeta(bookId)
    if (!book) return null

    const content = this.getBookContent(bookId)
    if (content === null) return null

    const progress = this.normalizeProgressForBook(this.getProgress(bookId), book)
    const chapterContent = this.buildChapterContent(book, content, progress.chapterIndex)
    if (!chapterContent) return null

    return {
      book,
      progress,
      chapterContent
    }
  }

  /** 获取书籍元数据 */
  getBookMeta(bookId: string): BookMeta | null {
    return this.getAllBooks().find((book) => book.id === bookId) ?? null
  }

  /** 获取书籍内容 */
  getBookContent(bookId: string): string | null {
    const books = this.store.get('books', [])
    const book = books.find((b) => b.id === bookId)
    if (!book) return null

    return this.readBookContent(book)
  }

  /** 获取单章正文 */
  getChapterContent(bookId: string, chapterIndex: number): ChapterContent | null {
    const book = this.getBookMeta(bookId)
    if (!book) return null

    const content = this.getBookContent(bookId)
    if (content === null) return null

    return this.buildChapterContent(book, content, chapterIndex)
  }

  /** 搜索书内正文，返回最多 maxResults 条命中。 */
  searchBook(bookId: string, query: string, maxResults = 50): SearchResult[] {
    const book = this.getBookMeta(bookId)
    if (!book) return []

    const normalizedQuery = query.trim()
    if (normalizedQuery.length === 0) return []

    const content = this.getBookContent(bookId)
    if (content === null) return []

    // 必须用「长度不变」的小写映射。
    // toLocaleLowerCase/toLowerCase 会把 'İ' 变成 'i̇'（长度 1 → 2），
    // 于是 lowerContent 的下标与原文错位：搜到的位置会指向别的字符，
    // 摘要和跳转偏移全部偏移。这里逐字符小写，只取长度仍为 1 的结果。
    const lowerContent = toLengthPreservingLowerCase(content)
    const lowerQuery = toLengthPreservingLowerCase(normalizedQuery)
    const results: SearchResult[] = []
    let fromIndex = 0

    while (results.length < maxResults) {
      const matchIndex = lowerContent.indexOf(lowerQuery, fromIndex)
      if (matchIndex === -1) break

      const chapterIndex = this.getChapterIndexForOffset(book.chapters, matchIndex)
      const chapter = book.chapters[chapterIndex]
      const snippetStart = Math.max(0, matchIndex - 24)
      const snippetEnd = Math.min(content.length, matchIndex + normalizedQuery.length + 36)
      const snippet = content.slice(snippetStart, snippetEnd).replace(/\s+/g, ' ').trim()

      results.push({
        bookId,
        chapterIndex,
        chapterTitle: chapter.title,
        chapterOffset: Math.max(0, matchIndex - chapter.offset),
        absoluteOffset: matchIndex,
        snippet
      })

      fromIndex = matchIndex + lowerQuery.length
    }

    return results
  }

  /** 获取指定书籍的书签 */
  getBookmarks(bookId: string): Bookmark[] {
    const bookmarks = this.store.get('bookmarks', {})
    return [...(bookmarks[bookId] ?? [])].sort((a, b) => b.createdAt - a.createdAt)
  }

  /** 新增书签 */
  addBookmark(bookId: string, input: BookmarkInput): Bookmark {
    const book = this.getBookMeta(bookId)
    if (!book) {
      throw new Error('Book not found')
    }

    this.assertValidProgress(
      {
        chapterIndex: input.chapterIndex,
        scrollPosition: input.scrollPosition,
        percentage: input.percentage
      },
      book
    )

    const bookmark: Bookmark = {
      id: randomUUID(),
      bookId,
      chapterIndex: input.chapterIndex,
      scrollPosition: input.scrollPosition,
      percentage: input.percentage,
      title: input.title.trim().slice(0, MAX_TITLE_LENGTH) || book.title,
      excerpt: input.excerpt.trim().slice(0, 120),
      createdAt: Date.now()
    }

    const bookmarks = this.store.get('bookmarks', {})
    bookmarks[bookId] = [bookmark, ...(bookmarks[bookId] ?? [])]
    this.store.set('bookmarks', bookmarks)

    return bookmark
  }

  /** 删除书签 */
  removeBookmark(bookId: string, bookmarkId: string): void {
    const bookmarks = this.store.get('bookmarks', {})
    bookmarks[bookId] = (bookmarks[bookId] ?? []).filter((item) => item.id !== bookmarkId)
    this.store.set('bookmarks', bookmarks)
  }

  /** 创建完整数据备份。 */
  createBackup(): MoyuBackup {
    const books = this.getAllBooks()
    return {
      version: 1,
      exportedAt: Date.now(),
      books: books.map((meta) => ({
        meta,
        content: this.getBookContent(meta.id) ?? ''
      })),
      progress: this.progressStore.getAllProgress(),
      bookmarks: this.store.get('bookmarks', {})
    }
  }

  /** 从备份恢复完整书架数据。 */
  restoreBackup(backup: MoyuBackup): number {
    this.assertBackup(backup)
    const snapshot = this.createStoreSnapshot()
    const previousBooks = snapshot.books
    const previousProgress = this.progressStore.getAllProgress()
    const previousLastReadAt = this.progressStore.getAllLastReadAt()
    // 快照只用于失败回滚。旧数据里可能残留不安全的 id，这里按“尽力备份”
    // 处理：读不到就记为需要清理，而不是让整个恢复流程直接失败。
    // 正文可能还在旧的内联 fileContents 里，因此走 readBookContent 而非只读文件。
    const previousContents = previousBooks
      .filter((book) => isSafeBookId(book.id))
      .map((book) => ({
        id: book.id,
        content: this.readBookContent(book) ?? ''
      }))

    try {
      for (const book of previousBooks) {
        if (isSafeBookId(book.id)) {
          this.removeBookContentFileIfExists(book.id)
        }
      }

      for (const { meta, content } of backup.books) {
        this.writeBookContentFile(meta.id, content)
      }

      this.store.set({
        books: backup.books.map((item) => item.meta),
        fileContents: {},
        bookmarks: backup.bookmarks
      })
      // 进度写在独立文件里；lastReadAt 从备份的 meta 重建
      // （更早的备份没有该字段时记 0）。
      this.progressStore.replace(backup.progress, buildLastReadAtFromBackup(backup.books))
      return backup.books.length
    } catch (error) {
      this.restoreStoreSnapshot(snapshot)
      this.progressStore.replace(previousProgress, previousLastReadAt)
      for (const { meta } of backup.books) {
        this.removeBookContentFileIfExists(meta.id)
      }
      for (const previous of previousContents) {
        this.writeBookContentFile(previous.id, previous.content)
      }
      throw error
    }
  }

  /** 更新书名 */
  updateTitle(bookId: string, newTitle: string): void {
    const books = this.store.get('books', [])
    const book = books.find((b) => b.id === bookId)
    if (!book) return

    if (newTitle.length > MAX_TITLE_LENGTH) {
      book.title = newTitle.slice(0, MAX_TITLE_LENGTH) + '…'
    } else {
      book.title = newTitle
    }

    this.store.set('books', books)
  }

  /**
   * 解析大文件正文路径，并确保它始终落在 booksDir 之内。
   *
   * bookId 来自备份文件，属于不可信输入：`../../x` 这类 id 会让 join 逃出
   * booksDir，把正文写到用户目录之外（甚至覆盖任意文件）。这里统一做包含性
   * 校验，越界直接抛错。
   */
  private resolveLargeFilePath(bookId: string): string {
    const filePath = join(this.booksDir, `${bookId}.txt`)
    const resolvedDir = resolve(this.booksDir)
    const resolvedPath = resolve(filePath)
    if (resolvedPath !== join(resolvedDir, `${bookId}.txt`) || !resolvedPath.startsWith(resolvedDir + sep)) {
      throw new TypeError('Invalid book id')
    }
    return resolvedPath
  }

  /** 将大文件内容写入独立文件 */
  private writeBookContentFile(bookId: string, content: string): void {
    writeFileSync(this.resolveLargeFilePath(bookId), content, 'utf-8')
  }

  /** 读取大文件内容 */
  private readBookContentFile(bookId: string): string | null {
    const filePath = this.resolveLargeFilePath(bookId)
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf-8')
  }

  /** 删除大文件 */
  private removeBookContentFile(bookId: string): void {
    const filePath = this.resolveLargeFilePath(bookId)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  private removeBookContentFileIfExists(bookId: string): void {
    try {
      this.removeBookContentFile(bookId)
    } catch {
      // 回滚的主错误更重要；清理失败最多留下孤儿正文文件。
    }
  }

  private createStoreSnapshot(): StoreSnapshot {
    return {
      books: this.store.get('books', []),
      fileContents: this.store.get('fileContents', {}),
      bookmarks: this.store.get('bookmarks', {})
    }
  }

  private restoreStoreSnapshot(snapshot: StoreSnapshot): void {
    try {
      this.store.set({
        books: snapshot.books,
        fileContents: snapshot.fileContents,
        bookmarks: snapshot.bookmarks
      })
    } catch {
      // 若底层存储自身不可写，保留原始异常给调用方。
    }
  }

  private assertValidProgress(progress: ReadingProgress, book: BookMeta): void {
    const chapterCount = book.chapters?.length ?? 0
    const maxChapterIndex = Math.max(chapterCount - 1, 0)

    if (
      !Number.isInteger(progress.chapterIndex) ||
      progress.chapterIndex < 0 ||
      progress.chapterIndex > maxChapterIndex ||
      typeof progress.scrollPosition !== 'number' ||
      !Number.isFinite(progress.scrollPosition) ||
      progress.scrollPosition < 0 ||
      !Number.isInteger(progress.percentage) ||
      progress.percentage < 0 ||
      progress.percentage > 100
    ) {
      throw new TypeError('Invalid reading progress')
    }
  }

  private normalizeProgressForBook(
    progress: ReadingProgress | null,
    book: BookMeta
  ): ReadingProgress {
    const chapterCount = book.chapters?.length ?? 0
    const maxChapterIndex = Math.max(chapterCount - 1, 0)
    if (!progress) {
      return { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
    }

    return {
      chapterIndex: Math.max(0, Math.min(progress.chapterIndex, maxChapterIndex)),
      scrollPosition: Math.max(0, progress.scrollPosition),
      percentage: Math.max(0, Math.min(100, progress.percentage))
    }
  }

  private buildChapterContent(
    book: BookMeta,
    content: string,
    chapterIndex: number
  ): ChapterContent | null {
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= book.chapters.length) {
      return null
    }

    const chapter = book.chapters[chapterIndex]
    const start = Math.max(0, Math.min(chapter.offset, content.length))
    const end = Math.max(start, Math.min(start + chapter.length, content.length))

    return {
      bookId: book.id,
      chapterIndex,
      title: chapter.title,
      content: content.slice(start, end),
      offset: start,
      length: end - start,
      totalLength: content.length,
      totalChapters: book.chapters.length
    }
  }

  /**
   * 定位 offset 所属的章节下标。
   *
   * 委托给共享的二分实现：搜索正文时每个命中都要调用一次，线性回扫
   * 会让「5000 章的小说搜一个常见字」退化成几十万次比较。
   */
  private getChapterIndexForOffset(chapters: Chapter[], offset: number): number {
    return findChapterIndexForOffset(chapters, offset)
  }

  private assertBackup(value: unknown): asserts value is MoyuBackup {
    if (!value || typeof value !== 'object') {
      throw new TypeError('Invalid backup file')
    }

    const backup = value as Partial<MoyuBackup>
    if (backup.version !== 1 || !Array.isArray(backup.books)) {
      throw new TypeError('Invalid backup file')
    }

    // progress / bookmarks 必须是「以书籍 id 为键」的对象。
    // 若放任字符串等非对象值通过，恢复后 getProgress 会读出垃圾数据，
    // 阅读位置直接错乱，且要到用户打开书时才会暴露。
    if (!isRecord(backup.progress) || !isRecord(backup.bookmarks)) {
      throw new TypeError('Invalid backup file')
    }

    for (const item of backup.books) {
      if (!item || typeof item !== 'object' || typeof item.content !== 'string') {
        throw new TypeError('Invalid backup file')
      }
      const meta = item.meta
      if (
        !meta ||
        typeof meta.id !== 'string' ||
        typeof meta.title !== 'string' ||
        !Array.isArray(meta.chapters)
      ) {
        throw new TypeError('Invalid backup file')
      }

      // 备份文件可能来自任何地方，id 会参与拼接正文文件路径，必须先校验，
      // 避免 restoreBackup 中途才失败并留下写了一半的书架状态。
      if (!isSafeBookId(meta.id)) {
        throw new TypeError('Invalid backup file')
      }
    }
  }

  /**
   * 兼容旧版本：早期只保存了“第 N 章”，这里按 offset 回到原文行，
   * 补全成“第 N 章 标题”并标记卷/章/段类型。
   */
  private hydrateStoredChapterTitles(books: BookMeta[]): HydratedBooksResult {
    let changed = false
    const migrations: ChapterMigration[] = []

    const hydrated = books.map((book) => {
      const content = this.getBookContentByMeta(book)
      if (!content) {
        if (!book.chapters || book.chapters.length === 0) return book
        const typedChapters = book.chapters.map((chapter) => this.ensureChapterType(chapter))
        if (typedChapters.some((chapter, index) => chapter !== book.chapters[index])) {
          changed = true
          return { ...book, chapters: typedChapters }
        }
        return book
      }

      // 解析规则升级后重建整本书的目录。旧版本只在 offset 上补全标题，
      // 无法移除正文中的小数和编号列表，因此必须重新扫描原文。
      if (book.chapterParserVersion !== CHAPTER_PARSER_VERSION) {
        const reparsedChapters = this.chapterParser.parse(content)
        changed = true
        migrations.push({
          bookId: book.id,
          previousChapters: book.chapters ?? [],
          nextChapters: reparsedChapters
        })
        return {
          ...book,
          chapters: reparsedChapters,
          chapterParserVersion: CHAPTER_PARSER_VERSION
        }
      }

      if (!book.chapters || book.chapters.length === 0) return book

      let bookChanged = false
      const chapters = book.chapters.map((chapter) => {
        const lineTitle = this.getLineTitleAtOffset(content, chapter.offset)
        const title = lineTitle && lineTitle.startsWith(chapter.title) ? lineTitle : chapter.title
        const type = getChapterType(title)

        if (title !== chapter.title || type !== chapter.type) {
          bookChanged = true
          return { ...chapter, title, type }
        }
        return chapter
      })

      if (!bookChanged) return book
      changed = true
      return { ...book, chapters }
    })

    return { books: hydrated, changed, migrations }
  }

  /** 将旧目录中的进度和书签按字符 offset 映射到新目录，避免升级后跳错章节。 */
  private migrateChapterReferences(migrations: ChapterMigration[]): void {
    if (migrations.length === 0) return

    const progress = this.progressStore.getAllProgress()
    const bookmarks = this.store.get('bookmarks', {})
    let progressChanged = false
    let bookmarksChanged = false

    for (const migration of migrations) {
      const savedProgress = progress[migration.bookId]
      if (savedProgress) {
        const chapterIndex = this.remapChapterIndex(
          savedProgress.chapterIndex,
          migration.previousChapters,
          migration.nextChapters
        )
        if (chapterIndex !== savedProgress.chapterIndex) {
          progress[migration.bookId] = { ...savedProgress, chapterIndex }
          progressChanged = true
        }
      }

      const savedBookmarks = bookmarks[migration.bookId]
      if (savedBookmarks?.length) {
        const nextBookmarks = savedBookmarks.map((bookmark) => {
          const chapterIndex = this.remapChapterIndex(
            bookmark.chapterIndex,
            migration.previousChapters,
            migration.nextChapters
          )
          if (chapterIndex === bookmark.chapterIndex) return bookmark
          bookmarksChanged = true
          return { ...bookmark, chapterIndex }
        })
        bookmarks[migration.bookId] = nextBookmarks
      }
    }

    if (progressChanged) {
      this.progressStore.replace(progress, this.progressStore.getAllLastReadAt())
    }
    if (bookmarksChanged) this.store.set('bookmarks', bookmarks)
  }

  private remapChapterIndex(index: number, previousChapters: Chapter[], nextChapters: Chapter[]): number {
    if (nextChapters.length === 0) return 0

    const previousIndex = Number.isInteger(index)
      ? Math.max(0, Math.min(index, Math.max(previousChapters.length - 1, 0)))
      : 0
    const previousChapter = previousChapters[previousIndex]
    if (!previousChapter) return 0
    return this.getChapterIndexForOffset(nextChapters, previousChapter.offset)
  }

  private ensureChapterType(chapter: Chapter): Chapter {
    const type = getChapterType(chapter.title)
    if (chapter.type === type) return chapter
    return { ...chapter, type }
  }

  /**
   * 读取书籍正文。
   *
   * 正文现在一律存成独立文件；旧版本把小于 5MB 的正文内联在 electron-store 的
   * fileContents 里，这里保留读取回退，并在读到旧数据时就地迁移成文件，
   * 迁移成功后从 store 中移除，避免旧数据长期占着 JSON。
   */
  private readBookContent(book: BookMeta): string | null {
    const fromFile = this.readBookContentFile(book.id)
    if (fromFile !== null) return fromFile

    const fileContents = this.store.get('fileContents', {})
    const legacyContent = fileContents[book.id]
    if (legacyContent === undefined) return null

    // 首次读到旧数据时迁移到文件，失败也不影响本次阅读。
    try {
      this.writeBookContentFile(book.id, legacyContent)
      delete fileContents[book.id]
      this.store.set('fileContents', fileContents)
    } catch {
      // 迁移失败时保留内联数据，下次读取再试。
    }

    return legacyContent
  }

  private getBookContentByMeta(book: BookMeta): string | null {
    return this.readBookContent(book)
  }

  private getLineTitleAtOffset(content: string, offset: number): string | null {
    if (offset < 0 || offset >= content.length) return null

    const lineEnd = content.indexOf('\n', offset)
    const rawLine = content.slice(offset, lineEnd === -1 ? content.length : lineEnd)
    const title = rawLine.trim()
    return title.length > 0 ? title : null
  }
}

/**
 * 从备份的书籍元数据里重建 lastReadAt 小表。
 *
 * createBackup 导出的 meta 已经带着 lastReadAt（getAllBooks 会合并小表），
 * 因此恢复时直接取回来即可；更早的备份若没有该字段则记 0。
 */
function buildLastReadAtFromBackup(
  books: Array<{ meta: BookMeta }>
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const { meta } of books) {
    result[meta.id] = typeof meta.lastReadAt === 'number' ? meta.lastReadAt : 0
  }
  return result
}

/**
 * 判断值是否为「普通对象」（排除 null 与数组）。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 书籍 ID 必须是不含路径分隔符的安全标识。
 * 正常 ID 由 randomUUID() 生成；这里同时兼容测试与旧数据里的简单字符串。
 */
function isSafeBookId(id: string): boolean {
  return id.length > 0 && id.length <= 200 && /^[A-Za-z0-9._-]+$/.test(id) && !id.includes('..')
}

/**
 * 逐字符小写，保证结果与输入**等长**。
 *
 * 搜索依赖「小写文本的下标 == 原文的下标」。但 JS 的 toLowerCase 对少数
 * 字符会改变长度（'İ' → 'i̇'，1 个码元变 2 个），一旦正文里出现这类字符，
 * 后续所有命中的 offset 都会错位，摘要与跳转位置随之出错。
 * 这里只在长度不变时采用小写结果，否则保留原字符。
 */
function toLengthPreservingLowerCase(text: string): string {
  let result = ''
  for (const char of text) {
    const lower = char.toLowerCase()
    result += lower.length === char.length ? lower : char
  }
  return result
}
