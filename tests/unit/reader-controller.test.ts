import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReaderController } from '../../src/main/reader-controller'
import type { BookMeta, ReadingProgress, Chapter } from '../../src/shared/types'

// Mock electron app module
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-app-data'
  }
}))

// Mock fs module
vi.mock('fs', () => ({
  existsSync: () => true,
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: () => '',
  unlinkSync: vi.fn()
}))

/** 创建 mock BookshelfManager */
function createMockBookshelf(options?: {
  books?: BookMeta[]
  contents?: Record<string, string>
  progress?: Record<string, ReadingProgress>
}) {
  const books = options?.books ?? []
  const contents = options?.contents ?? {}
  const progress = options?.progress ?? {}

  return {
    getAllBooks: vi.fn(() => books),
    getBookContent: vi.fn((bookId: string) => contents[bookId] ?? null),
    getProgress: vi.fn((bookId: string) => progress[bookId] ?? null),
    updateProgress: vi.fn(),
    addBook: vi.fn(),
    removeBook: vi.fn(),
    updateTitle: vi.fn()
  } as any
}

function createSampleChapters(): Chapter[] {
  return [
    { title: '第一章 开始', offset: 0, length: 100 },
    { title: '第二章 发展', offset: 100, length: 150 },
    { title: '第三章 结局', offset: 250, length: 50 }
  ]
}

function createSampleBook(id: string, chapters?: Chapter[]): BookMeta {
  return {
    id,
    title: '测试小说',
    filePath: '/path/to/test.txt',
    fileSize: 300,
    chapters: chapters ?? createSampleChapters(),
    addedAt: Date.now(),
    lastReadAt: Date.now()
  }
}

describe('ReaderController', () => {
  describe('constructor', () => {
    it('should create a controller with initial empty state', () => {
      const bookshelf = createMockBookshelf()
      const controller = new ReaderController(bookshelf)

      const state = controller.getCurrentState()
      expect(state.bookId).toBeNull()
      expect(state.content).toBeNull()
      expect(state.chapters).toEqual([])
      expect(state.progress).toEqual({
        chapterIndex: 0,
        scrollPosition: 0,
        percentage: 0
      })
    })
  })

  describe('openBook()', () => {
    it('should load book content and return default progress when no saved progress', () => {
      const bookId = 'book-1'
      const content = '这是一本测试小说的内容，包含多个章节。'
      const chapters = createSampleChapters()
      const book = createSampleBook(bookId, chapters)

      const bookshelf = createMockBookshelf({
        books: [book],
        contents: { [bookId]: content }
      })

      const controller = new ReaderController(bookshelf)
      const result = controller.openBook(bookId)

      expect(result).not.toBeNull()
      expect(result!.content).toBe(content)
      expect(result!.progress).toEqual({
        chapterIndex: 0,
        scrollPosition: 0,
        percentage: 0
      })
    })

    it('should restore saved reading progress', () => {
      const bookId = 'book-1'
      const content = '这是一本测试小说的内容。'
      const chapters = createSampleChapters()
      const book = createSampleBook(bookId, chapters)
      const savedProgress: ReadingProgress = {
        chapterIndex: 1,
        scrollPosition: 200,
        percentage: 45
      }

      const bookshelf = createMockBookshelf({
        books: [book],
        contents: { [bookId]: content },
        progress: { [bookId]: savedProgress }
      })

      const controller = new ReaderController(bookshelf)
      const result = controller.openBook(bookId)

      expect(result).not.toBeNull()
      expect(result!.progress).toEqual(savedProgress)
    })

    it('should return null when book does not exist', () => {
      const bookshelf = createMockBookshelf({ books: [] })
      const controller = new ReaderController(bookshelf)

      const result = controller.openBook('non-existent-id')
      expect(result).toBeNull()
    })

    it('should return null when book content is not available', () => {
      const bookId = 'book-1'
      const book = createSampleBook(bookId)

      const bookshelf = createMockBookshelf({
        books: [book],
        contents: {} // no content stored
      })

      const controller = new ReaderController(bookshelf)
      const result = controller.openBook(bookId)

      expect(result).toBeNull()
    })

    it('should update internal state after opening a book', () => {
      const bookId = 'book-1'
      const content = '小说内容'
      const chapters = createSampleChapters()
      const book = createSampleBook(bookId, chapters)

      const bookshelf = createMockBookshelf({
        books: [book],
        contents: { [bookId]: content }
      })

      const controller = new ReaderController(bookshelf)
      controller.openBook(bookId)

      const state = controller.getCurrentState()
      expect(state.bookId).toBe(bookId)
      expect(state.content).toBe(content)
      expect(state.chapters).toEqual(chapters)
    })
  })

  describe('goToChapter()', () => {
    let controller: ReaderController

    beforeEach(() => {
      const bookId = 'book-1'
      const content = 'a'.repeat(300) // 300 characters total
      const chapters = createSampleChapters()
      const book = createSampleBook(bookId, chapters)

      const bookshelf = createMockBookshelf({
        books: [book],
        contents: { [bookId]: content }
      })

      controller = new ReaderController(bookshelf)
      controller.openBook(bookId)
    })

    it('should update chapter index to the specified chapter', () => {
      controller.goToChapter(1)

      const state = controller.getCurrentState()
      expect(state.progress.chapterIndex).toBe(1)
    })

    it('should reset scroll position to 0 when jumping to a chapter', () => {
      controller.goToChapter(2)

      const state = controller.getCurrentState()
      expect(state.progress.scrollPosition).toBe(0)
    })

    it('should update percentage based on chapter offset', () => {
      // Chapter 1 starts at offset 100, total length 300
      // percentage = Math.round(100 / 300 * 100) = 33
      controller.goToChapter(1)

      const state = controller.getCurrentState()
      expect(state.progress.percentage).toBe(33)
    })

    it('should calculate percentage for last chapter', () => {
      // Chapter 2 starts at offset 250, total length 300
      // percentage = Math.round(250 / 300 * 100) = 83
      controller.goToChapter(2)

      const state = controller.getCurrentState()
      expect(state.progress.percentage).toBe(83)
    })

    it('should do nothing when chapter index is negative', () => {
      controller.goToChapter(0) // set to known state first
      const stateBefore = controller.getCurrentState()

      controller.goToChapter(-1)

      const stateAfter = controller.getCurrentState()
      expect(stateAfter.progress.chapterIndex).toBe(stateBefore.progress.chapterIndex)
    })

    it('should do nothing when chapter index exceeds available chapters', () => {
      controller.goToChapter(0) // set to known state first

      controller.goToChapter(10) // only 3 chapters exist

      const state = controller.getCurrentState()
      expect(state.progress.chapterIndex).toBe(0)
    })

    it('should handle jumping to first chapter (index 0)', () => {
      controller.goToChapter(1) // go to chapter 1 first
      controller.goToChapter(0) // then back to chapter 0

      const state = controller.getCurrentState()
      expect(state.progress.chapterIndex).toBe(0)
      expect(state.progress.percentage).toBe(0)
    })
  })

  describe('calculatePercentage()', () => {
    let controller: ReaderController

    beforeEach(() => {
      const bookshelf = createMockBookshelf()
      controller = new ReaderController(bookshelf)
    })

    it('should return 0 when position is 0', () => {
      expect(controller.calculatePercentage(0, 1000)).toBe(0)
    })

    it('should return 100 when position equals totalLength', () => {
      expect(controller.calculatePercentage(1000, 1000)).toBe(100)
    })

    it('should return 50 when position is half of totalLength', () => {
      expect(controller.calculatePercentage(500, 1000)).toBe(50)
    })

    it('should round to nearest integer', () => {
      // 333 / 1000 * 100 = 33.3 -> 33
      expect(controller.calculatePercentage(333, 1000)).toBe(33)
      // 335 / 1000 * 100 = 33.5 -> 34 (rounds up)
      expect(controller.calculatePercentage(335, 1000)).toBe(34)
    })

    it('should clamp result to 0 when position is negative', () => {
      expect(controller.calculatePercentage(-10, 1000)).toBe(0)
    })

    it('should clamp result to 100 when position exceeds totalLength', () => {
      expect(controller.calculatePercentage(1500, 1000)).toBe(100)
    })

    it('should return 0 when totalLength is 0', () => {
      expect(controller.calculatePercentage(50, 0)).toBe(0)
    })

    it('should return 0 when totalLength is negative', () => {
      expect(controller.calculatePercentage(50, -100)).toBe(0)
    })

    it('should handle small totalLength values', () => {
      // 1 / 3 * 100 = 33.33 -> 33
      expect(controller.calculatePercentage(1, 3)).toBe(33)
      // 2 / 3 * 100 = 66.67 -> 67
      expect(controller.calculatePercentage(2, 3)).toBe(67)
    })

    it('should return 1 for very small but non-zero positions', () => {
      // 1 / 100 * 100 = 1
      expect(controller.calculatePercentage(1, 100)).toBe(1)
    })
  })

  describe('getCurrentState()', () => {
    it('should return a copy of the state (not a reference)', () => {
      const bookId = 'book-1'
      const content = '内容'
      const chapters = createSampleChapters()
      const book = createSampleBook(bookId, chapters)

      const bookshelf = createMockBookshelf({
        books: [book],
        contents: { [bookId]: content }
      })

      const controller = new ReaderController(bookshelf)
      controller.openBook(bookId)

      const state1 = controller.getCurrentState()
      const state2 = controller.getCurrentState()

      // Modifying state1 should not affect state2
      state1.progress.chapterIndex = 99
      state1.chapters.push({ title: 'extra', offset: 999, length: 1 })

      expect(state2.progress.chapterIndex).toBe(0)
      expect(state2.chapters.length).toBe(3)
    })
  })
})
