import { app } from 'electron'
import Store from 'electron-store'
import { join } from 'path'
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
  MoyuBackup
} from '../shared/types'
import { MAX_TITLE_LENGTH } from '../shared/constants'

/** 大文件阈值：5MB */
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024

/** electron-store schema */
interface StoreSchema {
  books: BookMeta[]
  fileContents: Record<string, string>
  progress: Record<string, ReadingProgress>
  bookmarks: Record<string, Bookmark[]>
}

interface StoreSnapshot {
  books: BookMeta[]
  fileContents: Record<string, string>
  progress: Record<string, ReadingProgress>
  bookmarks: Record<string, Bookmark[]>
}

/**
 * 书架管理器
 * 负责小说列表管理和数据持久化
 */
export class BookshelfManager {
  private store: Store<StoreSchema>
  private booksDir: string

  constructor(store?: Store<StoreSchema>) {
    this.store = store ?? new Store<StoreSchema>({
      name: 'bookshelf',
      defaults: {
        books: [],
        fileContents: {},
        progress: {},
        bookmarks: {}
      }
    })

    // 大文件存储目录
    this.booksDir = join(app.getPath('userData'), 'books')
    if (!existsSync(this.booksDir)) {
      mkdirSync(this.booksDir, { recursive: true })
    }
  }

  /** 获取所有书籍元数据 */
  getAllBooks(): BookMeta[] {
    const books = this.store.get('books', [])
    const hydratedBooks = this.hydrateStoredChapterTitles(books)
    if (hydratedBooks.changed) {
      this.store.set('books', hydratedBooks.books)
    }
    return hydratedBooks.books
  }

  /** 添加书籍到书架 */
  addBook(bookData: BookData, chapters: Chapter[]): BookMeta {
    const id = randomUUID()
    const now = Date.now()
    const snapshot = this.createStoreSnapshot()
    let largeFileWritten = false

    const meta: BookMeta = {
      id,
      title: bookData.fileName,
      filePath: bookData.filePath,
      fileSize: bookData.fileSize,
      chapters,
      addedAt: now,
      lastReadAt: now
    }

    try {
      // 先持久化正文，再提交元数据。异常时回滚，避免书架指向不存在的正文。
      if (bookData.fileSize > LARGE_FILE_THRESHOLD) {
        this.writeLargeFile(id, bookData.content)
        largeFileWritten = true
      } else {
        const fileContents = this.store.get('fileContents', {})
        fileContents[id] = bookData.content
        this.store.set('fileContents', fileContents)
      }

      const books = this.store.get('books', [])
      books.push(meta)
      this.store.set('books', books)

      return meta
    } catch (error) {
      if (largeFileWritten) {
        this.removeLargeFileIfExists(id)
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
    const book = books[bookIndex]
    const nextBooks = books.filter((b) => b.id !== bookId)
    const fileContents = this.store.get('fileContents', {})
    const progress = this.store.get('progress', {})
    const bookmarks = this.store.get('bookmarks', {})
    delete progress[bookId]
    delete bookmarks[bookId]

    try {
      if (book.fileSize <= LARGE_FILE_THRESHOLD) {
        delete fileContents[bookId]
        this.store.set('fileContents', fileContents)
      }

      this.store.set('progress', progress)
      this.store.set('bookmarks', bookmarks)
      this.store.set('books', nextBooks)

      // 大文件正文最后删除：若删除失败，可回滚元数据，避免书籍不可读。
      if (book.fileSize > LARGE_FILE_THRESHOLD) {
        this.removeLargeFile(bookId)
      }
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

    const allProgress = this.store.get('progress', {})
    allProgress[bookId] = { ...progress }
    this.store.set('progress', allProgress)

    books[bookIndex].lastReadAt = Date.now()
    this.store.set('books', books)
  }

  /** 获取阅读进度 */
  getProgress(bookId: string): ReadingProgress | null {
    const allProgress = this.store.get('progress', {})
    return allProgress[bookId] ?? null
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

    if (book.fileSize > LARGE_FILE_THRESHOLD) {
      return this.readLargeFile(bookId)
    } else {
      const fileContents = this.store.get('fileContents', {})
      return fileContents[bookId] ?? null
    }
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

    const lowerContent = content.toLocaleLowerCase()
    const lowerQuery = normalizedQuery.toLocaleLowerCase()
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
      progress: this.store.get('progress', {}),
      bookmarks: this.store.get('bookmarks', {})
    }
  }

  /** 从备份恢复完整书架数据。 */
  restoreBackup(backup: MoyuBackup): number {
    this.assertBackup(backup)
    const snapshot = this.createStoreSnapshot()
    const previousBooks = snapshot.books
    const previousLargeFileContents = previousBooks
      .filter((book) => book.fileSize > LARGE_FILE_THRESHOLD)
      .map((book) => ({
        id: book.id,
        content: this.readLargeFile(book.id) ?? ''
      }))
    const nextFileContents: Record<string, string> = {}

    try {
      for (const book of previousBooks) {
        if (book.fileSize > LARGE_FILE_THRESHOLD) {
          this.removeLargeFileIfExists(book.id)
        }
      }

      for (const { meta, content } of backup.books) {
        if (meta.fileSize > LARGE_FILE_THRESHOLD) {
          this.writeLargeFile(meta.id, content)
        } else {
          nextFileContents[meta.id] = content
        }
      }

      this.store.set('books', backup.books.map((item) => item.meta))
      this.store.set('fileContents', nextFileContents)
      this.store.set('progress', backup.progress)
      this.store.set('bookmarks', backup.bookmarks)
      return backup.books.length
    } catch (error) {
      this.restoreStoreSnapshot(snapshot)
      for (const { meta } of backup.books) {
        if (meta.fileSize > LARGE_FILE_THRESHOLD) {
          this.removeLargeFileIfExists(meta.id)
        }
      }
      for (const previous of previousLargeFileContents) {
        this.writeLargeFile(previous.id, previous.content)
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

  /** 将大文件内容写入独立文件 */
  private writeLargeFile(bookId: string, content: string): void {
    const filePath = join(this.booksDir, `${bookId}.txt`)
    writeFileSync(filePath, content, 'utf-8')
  }

  /** 读取大文件内容 */
  private readLargeFile(bookId: string): string | null {
    const filePath = join(this.booksDir, `${bookId}.txt`)
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf-8')
  }

  /** 删除大文件 */
  private removeLargeFile(bookId: string): void {
    const filePath = join(this.booksDir, `${bookId}.txt`)
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  }

  private removeLargeFileIfExists(bookId: string): void {
    try {
      this.removeLargeFile(bookId)
    } catch {
      // 回滚的主错误更重要；清理失败最多留下孤儿正文文件。
    }
  }

  private createStoreSnapshot(): StoreSnapshot {
    return {
      books: this.store.get('books', []),
      fileContents: this.store.get('fileContents', {}),
      progress: this.store.get('progress', {}),
      bookmarks: this.store.get('bookmarks', {})
    }
  }

  private restoreStoreSnapshot(snapshot: StoreSnapshot): void {
    try {
      this.store.set('books', snapshot.books)
      this.store.set('fileContents', snapshot.fileContents)
      this.store.set('progress', snapshot.progress)
      this.store.set('bookmarks', snapshot.bookmarks)
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

  private getChapterIndexForOffset(chapters: Chapter[], offset: number): number {
    if (chapters.length === 0) return 0
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (offset >= chapters[i].offset) {
        return i
      }
    }
    return 0
  }

  private assertBackup(value: unknown): asserts value is MoyuBackup {
    if (!value || typeof value !== 'object') {
      throw new TypeError('Invalid backup file')
    }

    const backup = value as Partial<MoyuBackup>
    if (backup.version !== 1 || !Array.isArray(backup.books)) {
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
    }
  }

  /**
   * 兼容旧版本：早期只保存了“第 N 章”，这里按 offset 回到原文行，
   * 补全成“第 N 章 标题”并标记卷/章/段类型。
   */
  private hydrateStoredChapterTitles(books: BookMeta[]): { books: BookMeta[]; changed: boolean } {
    let changed = false

    const hydrated = books.map((book) => {
      if (!book.chapters || book.chapters.length === 0) return book

      const content = this.getBookContentByMeta(book)
      if (!content) {
        const typedChapters = book.chapters.map((chapter) => this.ensureChapterType(chapter))
        if (typedChapters.some((chapter, index) => chapter !== book.chapters[index])) {
          changed = true
          return { ...book, chapters: typedChapters }
        }
        return book
      }

      let bookChanged = false
      const chapters = book.chapters.map((chapter) => {
        const lineTitle = this.getLineTitleAtOffset(content, chapter.offset)
        const title = lineTitle && lineTitle.startsWith(chapter.title) ? lineTitle : chapter.title
        const type = this.getChapterType(title)

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

    return { books: hydrated, changed }
  }

  private ensureChapterType(chapter: Chapter): Chapter {
    const type = this.getChapterType(chapter.title)
    if (chapter.type === type) return chapter
    return { ...chapter, type }
  }

  private getBookContentByMeta(book: BookMeta): string | null {
    if (book.fileSize > LARGE_FILE_THRESHOLD) {
      return this.readLargeFile(book.id)
    }

    const fileContents = this.store.get('fileContents', {})
    return fileContents[book.id] ?? null
  }

  private getLineTitleAtOffset(content: string, offset: number): string | null {
    if (offset < 0 || offset >= content.length) return null

    const lineEnd = content.indexOf('\n', offset)
    const rawLine = content.slice(offset, lineEnd === -1 ? content.length : lineEnd)
    const title = rawLine.trim()
    return title.length > 0 ? title : null
  }

  private getChapterType(title: string): Chapter['type'] {
    if (/^第[一二三四五六七八九十百千万零\d]+[卷部集篇]|^卷[一二三四五六七八九十百千万零\d]+|^Volume\s*\d+|^Part\s*\d+/i.test(title)) {
      return 'volume'
    }
    if (/^第\s*\d+\s*段/.test(title)) return 'section'
    return 'chapter'
  }
}
