import { app } from 'electron'
import Store from 'electron-store'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import type { BookMeta, BookData, ReadingProgress, Chapter } from '../shared/types'
import { MAX_TITLE_LENGTH } from '../shared/constants'

/** 大文件阈值：5MB */
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024

/** electron-store schema */
interface StoreSchema {
  books: BookMeta[]
  fileContents: Record<string, string>
  progress: Record<string, ReadingProgress>
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
        progress: {}
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
  addBook(bookData: BookData, chapters: import('../shared/types').Chapter[]): BookMeta {
    const id = randomUUID()
    const now = Date.now()

    const meta: BookMeta = {
      id,
      title: bookData.fileName,
      filePath: bookData.filePath,
      fileSize: bookData.fileSize,
      chapters,
      addedAt: now,
      lastReadAt: now
    }

    // 持久化文件内容
    if (bookData.fileSize > LARGE_FILE_THRESHOLD) {
      // 大文件：存储为独立文件
      this.writeLargeFile(id, bookData.content)
    } else {
      // 小文件：存储在 electron-store 中
      const fileContents = this.store.get('fileContents', {})
      fileContents[id] = bookData.content
      this.store.set('fileContents', fileContents)
    }

    // 添加元数据到书籍列表
    const books = this.store.get('books', [])
    books.push(meta)
    this.store.set('books', books)

    return meta
  }

  /** 删除书籍 */
  removeBook(bookId: string): void {
    // 移除元数据
    const books = this.store.get('books', [])
    const bookIndex = books.findIndex((b) => b.id === bookId)
    if (bookIndex === -1) return

    const book = books[bookIndex]
    books.splice(bookIndex, 1)
    this.store.set('books', books)

    // 移除文件内容
    if (book.fileSize > LARGE_FILE_THRESHOLD) {
      this.removeLargeFile(bookId)
    } else {
      const fileContents = this.store.get('fileContents', {})
      delete fileContents[bookId]
      this.store.set('fileContents', fileContents)
    }

    // 移除阅读进度
    const progress = this.store.get('progress', {})
    delete progress[bookId]
    this.store.set('progress', progress)
  }

  /** 更新阅读进度 */
  updateProgress(bookId: string, progress: ReadingProgress): void {
    const books = this.store.get('books', [])
    const bookIndex = books.findIndex((b) => b.id === bookId)
    if (bookIndex === -1) return

    // 持久化阅读进度
    const allProgress = this.store.get('progress', {})
    allProgress[bookId] = progress
    this.store.set('progress', allProgress)

    // 更新 lastReadAt 时间戳
    books[bookIndex].lastReadAt = Date.now()
    this.store.set('books', books)
  }

  /** 获取阅读进度 */
  getProgress(bookId: string): ReadingProgress | null {
    const allProgress = this.store.get('progress', {})
    return allProgress[bookId] ?? null
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
