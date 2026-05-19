import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BookshelfManager } from '../../src/main/bookshelf-manager'
import type { BookData, Chapter } from '../../src/shared/types'

// Mock electron app module
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-app-data'
  }
}))

// Mock fs module
const mockFiles: Record<string, string> = {}
vi.mock('fs', () => {
  return {
    default: {
      existsSync: (path: string) => path in mockFiles || path === '/tmp/test-app-data/books',
      mkdirSync: vi.fn(),
      writeFileSync: (path: string, content: string) => { mockFiles[path] = content },
      readFileSync: (path: string) => mockFiles[path] ?? '',
      unlinkSync: (path: string) => { delete mockFiles[path] }
    },
    existsSync: (path: string) => path in mockFiles || path === '/tmp/test-app-data/books',
    mkdirSync: vi.fn(),
    writeFileSync: (path: string, content: string) => { mockFiles[path] = content },
    readFileSync: (path: string) => mockFiles[path] ?? '',
    unlinkSync: (path: string) => { delete mockFiles[path] }
  }
})

/** 创建一个内存中的 mock store */
function createMockStore() {
  let data: Record<string, unknown> = {
    books: [],
    fileContents: {},
    progress: {}
  }

  return {
    get: (key: string, defaultValue?: unknown) => {
      const value = data[key]
      if (value === undefined) return defaultValue
      // Return a deep copy to simulate real store behavior
      return JSON.parse(JSON.stringify(value))
    },
    set: (key: string, value: unknown) => {
      data[key] = JSON.parse(JSON.stringify(value))
    },
    delete: (key: string) => {
      delete data[key]
    }
  } as any
}

function createSampleBookData(overrides?: Partial<BookData>): BookData {
  return {
    fileName: '测试小说',
    filePath: '/path/to/测试小说.txt',
    content: '这是一本测试小说的内容。',
    fileSize: 100,
    encoding: 'utf-8',
    ...overrides
  }
}

function createSampleChapters(): Chapter[] {
  return [
    { title: '第一章 开始', offset: 0, length: 50 },
    { title: '第二章 发展', offset: 50, length: 50 }
  ]
}

describe('BookshelfManager', () => {
  let manager: BookshelfManager
  let mockStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    mockStore = createMockStore()
    manager = new BookshelfManager(mockStore)
  })

  describe('getAllBooks()', () => {
    it('should return empty array when no books exist', () => {
      const books = manager.getAllBooks()
      expect(books).toEqual([])
    })

    it('should return all books after adding', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()

      manager.addBook(bookData, chapters)
      manager.addBook(
        createSampleBookData({ fileName: '第二本书', filePath: '/path/to/second.txt' }),
        chapters
      )

      const books = manager.getAllBooks()
      expect(books).toHaveLength(2)
      expect(books[0].title).toBe('测试小说')
      expect(books[1].title).toBe('第二本书')
    })

    it('should hydrate old bare chapter titles from the stored content line', () => {
      const bookData = createSampleBookData({
        content: '第310章 斗困兽，气血与真元的融合\n正文内容\n第311章 后续标题\n更多内容',
        fileSize: 100
      })
      const meta = manager.addBook(bookData, [
        { title: '第310章', offset: 0, length: 20 },
        { title: '第311章', offset: bookData.content.indexOf('第311章'), length: 20 }
      ])

      const books = manager.getAllBooks()
      const book = books.find((item) => item.id === meta.id)!

      expect(book.chapters[0].title).toBe('第310章 斗困兽，气血与真元的融合')
      expect(book.chapters[0].type).toBe('chapter')
      expect(book.chapters[1].title).toBe('第311章 后续标题')
    })
  })

  describe('addBook()', () => {
    it('should create a BookMeta with correct fields', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()

      const meta = manager.addBook(bookData, chapters)

      expect(meta.id).toBeDefined()
      expect(meta.id.length).toBeGreaterThan(0)
      expect(meta.title).toBe('测试小说')
      expect(meta.filePath).toBe('/path/to/测试小说.txt')
      expect(meta.fileSize).toBe(100)
      expect(meta.chapters).toEqual(chapters)
      expect(meta.addedAt).toBeGreaterThan(0)
      expect(meta.lastReadAt).toBeGreaterThan(0)
    })

    it('should store small file content in electron-store', () => {
      const bookData = createSampleBookData({ fileSize: 1000 })
      const chapters = createSampleChapters()

      const meta = manager.addBook(bookData, chapters)

      const fileContents = mockStore.get('fileContents', {})
      expect(fileContents[meta.id]).toBe(bookData.content)
    })

    it('should store large file content in separate file', () => {
      const largeContent = 'x'.repeat(6 * 1024 * 1024) // 6MB
      const bookData = createSampleBookData({
        content: largeContent,
        fileSize: 6 * 1024 * 1024
      })
      const chapters = createSampleChapters()

      const meta = manager.addBook(bookData, chapters)

      // Large file should NOT be in electron-store fileContents
      const fileContents = mockStore.get('fileContents', {})
      expect(fileContents[meta.id]).toBeUndefined()
    })

    it('should generate unique IDs for each book', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()

      const meta1 = manager.addBook(bookData, chapters)
      const meta2 = manager.addBook(bookData, chapters)

      expect(meta1.id).not.toBe(meta2.id)
    })
  })

  describe('removeBook()', () => {
    it('should remove book from the list', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      manager.removeBook(meta.id)

      const books = manager.getAllBooks()
      expect(books).toHaveLength(0)
    })

    it('should remove file content from store for small files', () => {
      const bookData = createSampleBookData({ fileSize: 1000 })
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      manager.removeBook(meta.id)

      const fileContents = mockStore.get('fileContents', {})
      expect(fileContents[meta.id]).toBeUndefined()
    })

    it('should remove reading progress', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      // Manually set progress
      const progress = mockStore.get('progress', {})
      progress[meta.id] = { chapterIndex: 1, scrollPosition: 100, percentage: 50 }
      mockStore.set('progress', progress)

      manager.removeBook(meta.id)

      const updatedProgress = mockStore.get('progress', {})
      expect(updatedProgress[meta.id]).toBeUndefined()
    })

    it('should not affect other books when removing one', () => {
      const chapters = createSampleChapters()
      const meta1 = manager.addBook(createSampleBookData({ fileName: 'Book1' }), chapters)
      const meta2 = manager.addBook(createSampleBookData({ fileName: 'Book2' }), chapters)

      manager.removeBook(meta1.id)

      const books = manager.getAllBooks()
      expect(books).toHaveLength(1)
      expect(books[0].id).toBe(meta2.id)
      expect(books[0].title).toBe('Book2')
    })

    it('should do nothing when removing non-existent book', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      manager.addBook(bookData, chapters)

      manager.removeBook('non-existent-id')

      const books = manager.getAllBooks()
      expect(books).toHaveLength(1)
    })
  })

  describe('updateProgress()', () => {
    it('should persist reading progress for a book', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      const progress = { chapterIndex: 1, scrollPosition: 200, percentage: 45 }
      manager.updateProgress(meta.id, progress)

      const stored = manager.getProgress(meta.id)
      expect(stored).toEqual(progress)
    })

    it('should update lastReadAt timestamp when progress is updated', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)
      const originalLastReadAt = meta.lastReadAt

      const progress = { chapterIndex: 0, scrollPosition: 50, percentage: 10 }
      manager.updateProgress(meta.id, progress)

      const books = manager.getAllBooks()
      expect(books[0].lastReadAt).toBeGreaterThanOrEqual(originalLastReadAt)
    })

    it('should do nothing when updating progress for non-existent book', () => {
      const progress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      manager.updateProgress('non-existent-id', progress)

      const stored = manager.getProgress('non-existent-id')
      expect(stored).toBeNull()
    })

    it('should overwrite previous progress', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      manager.updateProgress(meta.id, { chapterIndex: 0, scrollPosition: 100, percentage: 20 })
      manager.updateProgress(meta.id, { chapterIndex: 1, scrollPosition: 300, percentage: 60 })

      const stored = manager.getProgress(meta.id)
      expect(stored).toEqual({ chapterIndex: 1, scrollPosition: 300, percentage: 60 })
    })
  })

  describe('getProgress()', () => {
    it('should return null for a book with no progress', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      const progress = manager.getProgress(meta.id)
      expect(progress).toBeNull()
    })

    it('should return null for non-existent book', () => {
      const progress = manager.getProgress('non-existent-id')
      expect(progress).toBeNull()
    })

    it('should return the correct progress after update', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      const expected = { chapterIndex: 2, scrollPosition: 500, percentage: 75 }
      manager.updateProgress(meta.id, expected)

      const result = manager.getProgress(meta.id)
      expect(result).toEqual(expected)
    })
  })

  describe('updateTitle()', () => {
    it('should update the title of an existing book', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      manager.updateTitle(meta.id, '新书名')

      const books = manager.getAllBooks()
      expect(books[0].title).toBe('新书名')
    })

    it('should do nothing when book is not found', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      manager.addBook(bookData, chapters)

      manager.updateTitle('non-existent-id', '新书名')

      const books = manager.getAllBooks()
      expect(books[0].title).toBe('测试小说')
    })

    it('should keep title as-is when length is exactly 50 characters', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      const title50 = 'a'.repeat(50)
      manager.updateTitle(meta.id, title50)

      const books = manager.getAllBooks()
      expect(books[0].title).toBe(title50)
      expect(books[0].title.length).toBe(50)
    })

    it('should truncate title and append ellipsis when exceeding 50 characters', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      const longTitle = 'a'.repeat(60)
      manager.updateTitle(meta.id, longTitle)

      const books = manager.getAllBooks()
      expect(books[0].title).toBe('a'.repeat(50) + '…')
      expect(books[0].title.length).toBe(51) // 50 chars + ellipsis character
    })

    it('should handle short titles without modification', () => {
      const bookData = createSampleBookData()
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      manager.updateTitle(meta.id, '短')

      const books = manager.getAllBooks()
      expect(books[0].title).toBe('短')
    })
  })

  describe('getBookContent()', () => {
    it('should return content for small files', () => {
      const bookData = createSampleBookData({ fileSize: 1000 })
      const chapters = createSampleChapters()
      const meta = manager.addBook(bookData, chapters)

      const content = manager.getBookContent(meta.id)
      expect(content).toBe(bookData.content)
    })

    it('should return null for non-existent book', () => {
      const content = manager.getBookContent('non-existent-id')
      expect(content).toBeNull()
    })
  })
})
