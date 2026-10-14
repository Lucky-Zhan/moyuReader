import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ReadingProgress } from '../../src/shared/types'
import { IPC_CHANNELS } from '../../src/shared/ipc-channels'

// Mock ipcMain.handle
const handlers: Record<string, (...args: unknown[]) => unknown> = {}
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }
  }
}))

// Mock BookshelfManager
function createMockBookshelfManager() {
  return {
    getAllBooks: vi.fn().mockReturnValue([
      { id: 'book-1', title: '测试小说', filePath: '/path/to/test.txt', fileSize: 100, chapters: [], addedAt: 1000, lastReadAt: 2000 }
    ]),
    removeBook: vi.fn(),
    updateProgress: vi.fn(),
    getProgress: vi.fn().mockReturnValue({ chapterIndex: 1, scrollPosition: 200, percentage: 35 }),
    updateTitle: vi.fn(),
    getBookContent: vi.fn().mockReturnValue('这是书籍内容'),
    openBook: vi.fn().mockReturnValue({
      book: {
        id: 'book-1',
        title: '测试小说',
        filePath: '/path/to/test.txt',
        fileSize: 100,
        chapters: [{ title: '第一章', offset: 0, length: 6 }],
        addedAt: 1000,
        lastReadAt: 2000
      },
      progress: { chapterIndex: 0, scrollPosition: 0, percentage: 0 },
      chapterContent: {
        bookId: 'book-1',
        chapterIndex: 0,
        title: '第一章',
        content: '这是书籍内容',
        offset: 0,
        length: 6,
        totalLength: 6,
        totalChapters: 1
      }
    }),
    getChapterContent: vi.fn().mockReturnValue({
      bookId: 'book-1',
      chapterIndex: 0,
      title: '第一章',
      content: '这是书籍内容',
      offset: 0,
      length: 6,
      totalLength: 6,
      totalChapters: 1
    }),
    searchBook: vi.fn().mockReturnValue([
      {
        bookId: 'book-1',
        chapterIndex: 0,
        chapterTitle: '第一章',
        chapterOffset: 2,
        absoluteOffset: 2,
        snippet: '这是书籍内容'
      }
    ]),
    getBookmarks: vi.fn().mockReturnValue([]),
    addBookmark: vi.fn().mockReturnValue({
      id: 'bookmark-1',
      bookId: 'book-1',
      chapterIndex: 0,
      scrollPosition: 12,
      percentage: 10,
      title: '第一章',
      excerpt: '摘录',
      createdAt: 1000
    }),
    removeBookmark: vi.fn()
  }
}

function createMockSettingsManager() {
  return {
    getSettings: vi.fn().mockReturnValue({
      fontSize: 16,
      fontFamily: 'Consolas, monospace',
      lineHeight: 1.8,
      disguiseTheme: 'dark',
      stealthEnabled: true,
      hideShortcut: 'CommandOrControl+Shift+H',
      mouseLeaveAction: 'deferred-quit',
      mouseLeaveDelay: 5000,
      mouseReturnDelay: 2000,
      autoSaveInterval: 30000
    }),
    setFontSize: vi.fn(),
    setFontFamily: vi.fn(),
    setLineHeight: vi.fn(),
    setDisguiseTheme: vi.fn(),
    setStealthEnabled: vi.fn(),
    setMouseLeaveAction: vi.fn(),
    setMouseLeaveDelay: vi.fn(),
    setMouseReturnDelay: vi.fn()
  }
}

describe('registerBookshelfHandlers', () => {
  let mockManager: ReturnType<typeof createMockBookshelfManager>

  beforeEach(async () => {
    // Clear handlers between tests
    Object.keys(handlers).forEach(key => delete handlers[key])
    mockManager = createMockBookshelfManager()

    // Import after mocks are set up
    const { registerBookshelfHandlers } = await import('../../src/main/ipc-handlers')
    registerBookshelfHandlers(mockManager as any, () => true)
  })

  it('should register all required IPC channels', () => {
    expect(handlers[IPC_CHANNELS.BOOKSHELF_GET_ALL]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_REMOVE]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_PROGRESS]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_GET_PROGRESS]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE]).toBeDefined()
    expect(handlers[IPC_CHANNELS.READER_GET_CONTENT]).toBeDefined()
    expect(handlers[IPC_CHANNELS.READER_OPEN]).toBeDefined()
    expect(handlers[IPC_CHANNELS.READER_GET_CHAPTER_CONTENT]).toBeDefined()
    expect(handlers[IPC_CHANNELS.READER_SEARCH]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKMARKS_GET]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKMARKS_ADD]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKMARKS_REMOVE]).toBeDefined()
  })

  describe('bookshelf:getAll', () => {
    it('should call getAllBooks and return the result', () => {
      const result = handlers[IPC_CHANNELS.BOOKSHELF_GET_ALL]({})
      expect(mockManager.getAllBooks).toHaveBeenCalled()
      expect(result).toEqual([
        { id: 'book-1', title: '测试小说', filePath: '/path/to/test.txt', fileSize: 100, chapters: [], addedAt: 1000, lastReadAt: 2000 }
      ])
    })
  })

  describe('bookshelf:remove', () => {
    it('should call removeBook with the provided bookId', () => {
      handlers[IPC_CHANNELS.BOOKSHELF_REMOVE]({}, 'book-1')
      expect(mockManager.removeBook).toHaveBeenCalledWith('book-1')
    })
  })

  it('should reject calls from an untrusted sender', async () => {
    Object.keys(handlers).forEach(key => delete handlers[key])
    const { registerBookshelfHandlers } = await import('../../src/main/ipc-handlers')
    registerBookshelfHandlers(mockManager as any, () => false)

    expect(() => handlers[IPC_CHANNELS.BOOKSHELF_GET_ALL]({})).toThrow('untrusted sender')
    expect(mockManager.getAllBooks).not.toHaveBeenCalled()
  })

  it('should reject invalid book identifiers', () => {
    expect(() => handlers[IPC_CHANNELS.BOOKSHELF_REMOVE]({}, ' ')).toThrow(
      'Invalid book id'
    )
    expect(mockManager.removeBook).not.toHaveBeenCalled()
  })

  it('should reject invalid reading progress', () => {
    expect(() =>
      handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_PROGRESS]({}, 'book-1', {
        chapterIndex: -1,
        scrollPosition: 0,
        percentage: 101
      })
    ).toThrow('Invalid reading progress')
    expect(mockManager.updateProgress).not.toHaveBeenCalled()
  })

  it('should trim valid titles and reject empty titles', () => {
    handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE]({}, 'book-1', '  新书名  ')
    expect(mockManager.updateTitle).toHaveBeenCalledWith('book-1', '新书名')

    expect(() =>
      handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE]({}, 'book-1', '   ')
    ).toThrow('Invalid book title')
  })

  describe('bookshelf:updateProgress', () => {
    it('should call updateProgress with bookId and progress', () => {
      const progress: ReadingProgress = { chapterIndex: 2, scrollPosition: 300, percentage: 50 }
      handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_PROGRESS]({}, 'book-1', progress)
      expect(mockManager.updateProgress).toHaveBeenCalledWith('book-1', progress)
    })
  })

  describe('bookshelf:getProgress', () => {
    it('should call getProgress with bookId and return the result', () => {
      const result = handlers[IPC_CHANNELS.BOOKSHELF_GET_PROGRESS]({}, 'book-1')
      expect(mockManager.getProgress).toHaveBeenCalledWith('book-1')
      expect(result).toEqual({ chapterIndex: 1, scrollPosition: 200, percentage: 35 })
    })
  })

  describe('bookshelf:updateTitle', () => {
    it('should call updateTitle with bookId and new title', () => {
      handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE]({}, 'book-1', '新书名')
      expect(mockManager.updateTitle).toHaveBeenCalledWith('book-1', '新书名')
    })
  })

  describe('reader:getContent', () => {
    it('should call getBookContent and return the result', () => {
      const result = handlers[IPC_CHANNELS.READER_GET_CONTENT]({}, 'book-1')
      expect(mockManager.getBookContent).toHaveBeenCalledWith('book-1')
      expect(result).toBe('这是书籍内容')
    })
  })

  describe('reader:open', () => {
    it('should call openBook and return the result', () => {
      const result = handlers[IPC_CHANNELS.READER_OPEN]({}, 'book-1')
      expect(mockManager.openBook).toHaveBeenCalledWith('book-1')
      expect(result).toEqual(expect.objectContaining({
        book: expect.objectContaining({ id: 'book-1' }),
        progress: { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      }))
    })
  })

  describe('reader:getChapterContent', () => {
    it('should call getChapterContent and return the result', () => {
      const result = handlers[IPC_CHANNELS.READER_GET_CHAPTER_CONTENT]({}, 'book-1', 0)
      expect(mockManager.getChapterContent).toHaveBeenCalledWith('book-1', 0)
      expect(result).toEqual(expect.objectContaining({
        bookId: 'book-1',
        chapterIndex: 0,
        content: '这是书籍内容'
      }))
    })

    it('should reject invalid chapter indexes', () => {
      expect(() =>
        handlers[IPC_CHANNELS.READER_GET_CHAPTER_CONTENT]({}, 'book-1', -1)
      ).toThrow('Invalid chapter index')
      expect(() =>
        handlers[IPC_CHANNELS.READER_GET_CHAPTER_CONTENT]({}, 'book-1', 1.5)
      ).toThrow('Invalid chapter index')
    })
  })

  describe('reader:search', () => {
    it('should validate and forward search queries', () => {
      const result = handlers[IPC_CHANNELS.READER_SEARCH]({}, 'book-1', ' 正文 ')

      expect(mockManager.searchBook).toHaveBeenCalledWith('book-1', '正文')
      expect(result).toEqual([
        expect.objectContaining({ bookId: 'book-1', snippet: '这是书籍内容' })
      ])
    })

    it('should reject empty search queries', () => {
      expect(() => handlers[IPC_CHANNELS.READER_SEARCH]({}, 'book-1', '  '))
        .toThrow('Invalid search query')
      expect(mockManager.searchBook).not.toHaveBeenCalled()
    })
  })

  describe('bookmarks', () => {
    it('should get, add and remove bookmarks', () => {
      handlers[IPC_CHANNELS.BOOKMARKS_GET]({}, 'book-1')
      expect(mockManager.getBookmarks).toHaveBeenCalledWith('book-1')

      const bookmark = handlers[IPC_CHANNELS.BOOKMARKS_ADD]({}, 'book-1', {
        chapterIndex: 0,
        scrollPosition: 12,
        percentage: 10,
        title: '第一章',
        excerpt: '摘录'
      })
      expect(mockManager.addBookmark).toHaveBeenCalledWith('book-1', {
        chapterIndex: 0,
        scrollPosition: 12,
        percentage: 10,
        title: '第一章',
        excerpt: '摘录'
      })
      expect(bookmark).toEqual(expect.objectContaining({ id: 'bookmark-1' }))

      handlers[IPC_CHANNELS.BOOKMARKS_REMOVE]({}, 'book-1', 'bookmark-1')
      expect(mockManager.removeBookmark).toHaveBeenCalledWith('book-1', 'bookmark-1')
    })

    it('should reject invalid bookmarks', () => {
      expect(() =>
        handlers[IPC_CHANNELS.BOOKMARKS_ADD]({}, 'book-1', {
          chapterIndex: 0,
          scrollPosition: -1,
          percentage: 10,
          title: '第一章',
          excerpt: '摘录'
        })
      ).toThrow('Invalid reading progress')
      expect(mockManager.addBookmark).not.toHaveBeenCalled()
    })
  })
})

describe('registerSettingsHandlers', () => {
  let mockManager: ReturnType<typeof createMockSettingsManager>

  beforeEach(async () => {
    Object.keys(handlers).forEach(key => delete handlers[key])
    mockManager = createMockSettingsManager()

    const { registerSettingsHandlers } = await import('../../src/main/ipc-handlers')
    registerSettingsHandlers(mockManager as any, () => true)
  })

  it('should register all required settings IPC channels', () => {
    expect(handlers[IPC_CHANNELS.SETTINGS_GET]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_FONT_SIZE]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_FONT_FAMILY]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_LINE_HEIGHT]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_DISGUISE_THEME]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_ACTION]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_DELAY]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_RETURN_DELAY]).toBeDefined()
  })

  it('settings:get should return full settings', () => {
    const result = handlers[IPC_CHANNELS.SETTINGS_GET]({})
    expect(mockManager.getSettings).toHaveBeenCalled()
    expect(result).toEqual({
      fontSize: 16,
      fontFamily: 'Consolas, monospace',
      lineHeight: 1.8,
      disguiseTheme: 'dark',
      stealthEnabled: true,
      hideShortcut: 'CommandOrControl+Shift+H',
      mouseLeaveAction: 'deferred-quit',
      mouseLeaveDelay: 5000,
      mouseReturnDelay: 2000,
      autoSaveInterval: 30000
    })
  })

  it('settings:setDisguiseTheme should persist the selected theme', () => {
    handlers[IPC_CHANNELS.SETTINGS_SET_DISGUISE_THEME]({}, 'paper')
    expect(mockManager.setDisguiseTheme).toHaveBeenCalledWith('paper')
  })

  it('settings:setLineHeight should persist the selected line height', () => {
    handlers[IPC_CHANNELS.SETTINGS_SET_LINE_HEIGHT]({}, 2)
    expect(mockManager.setLineHeight).toHaveBeenCalledWith(2)
  })

  it('settings:setStealthEnabled should persist the selected stealth mode state', () => {
    handlers[IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED]({}, false)
    expect(mockManager.setStealthEnabled).toHaveBeenCalledWith(false)
  })

  it('settings:setMouseLeaveAction should validate and persist the selected action', () => {
    handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_ACTION]({}, 'hide')
    expect(mockManager.setMouseLeaveAction).toHaveBeenCalledWith('hide')
  })

  it('settings:setMouseLeaveDelay should validate and persist the selected delay', () => {
    handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_DELAY]({}, 9000)
    expect(mockManager.setMouseLeaveDelay).toHaveBeenCalledWith(9000)
  })

  it('settings:setMouseReturnDelay should validate and persist the selected show delay', () => {
    handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_RETURN_DELAY]({}, 0)
    expect(mockManager.setMouseReturnDelay).toHaveBeenCalledWith(0)
  })

  it('should notify the stealth manager when mouse leave settings change', async () => {
    Object.keys(handlers).forEach(key => delete handlers[key])
    const onMouseLeaveConfigChange = vi.fn()
    const { registerSettingsHandlers } = await import('../../src/main/ipc-handlers')
    registerSettingsHandlers(mockManager as any, () => true, undefined, onMouseLeaveConfigChange)

    handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_ACTION]({}, 'deferred-quit')
    handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_DELAY]({}, 7000)
    handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_RETURN_DELAY]({}, 3000)

    expect(onMouseLeaveConfigChange).toHaveBeenNthCalledWith(1, {
      mouseLeaveAction: 'deferred-quit'
    })
    expect(onMouseLeaveConfigChange).toHaveBeenNthCalledWith(2, {
      mouseLeaveDelay: 7000
    })
    expect(onMouseLeaveConfigChange).toHaveBeenNthCalledWith(3, {
      mouseReturnDelay: 3000
    })
  })

  it('settings:setStealthEnabled should call the optional side-effect callback', async () => {
    Object.keys(handlers).forEach(key => delete handlers[key])
    const onStealthEnabledChange = vi.fn()
    const { registerSettingsHandlers } = await import('../../src/main/ipc-handlers')
    registerSettingsHandlers(mockManager as any, () => true, onStealthEnabledChange)

    handlers[IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED]({}, false)
    expect(onStealthEnabledChange).toHaveBeenCalledWith(false)
  })

  it('should validate font size, font family, line height, theme and boolean settings', () => {
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_FONT_SIZE]({}, Number.NaN)
    ).toThrow('Invalid font size')
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_FONT_FAMILY]({}, 'url(javascript:bad)')
    ).toThrow('Invalid font family')
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_LINE_HEIGHT]({}, 1.3)
    ).toThrow('Invalid line height')
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_DISGUISE_THEME]({}, 'neon')
    ).toThrow('Invalid disguise theme')
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED]({}, 'false')
    ).toThrow('Invalid stealth mode state')
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_ACTION]({}, 'later')
    ).toThrow('Invalid mouse leave action')
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_LEAVE_DELAY]({}, 5500)
    ).toThrow('Invalid mouse leave delay')
    expect(() =>
      handlers[IPC_CHANNELS.SETTINGS_SET_MOUSE_RETURN_DELAY]({}, 5500)
    ).toThrow('Invalid mouse return delay')
  })

  it('should reject settings calls from an untrusted sender', async () => {
    Object.keys(handlers).forEach(key => delete handlers[key])
    const { registerSettingsHandlers } = await import('../../src/main/ipc-handlers')
    registerSettingsHandlers(mockManager as any, () => false)

    expect(() => handlers[IPC_CHANNELS.SETTINGS_GET]({})).toThrow('untrusted sender')
    expect(mockManager.getSettings).not.toHaveBeenCalled()
  })
})

describe('registerStealthMouseHandlers', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach(key => delete handlers[key])
  })

  it('should validate the sender before forwarding mouse events', async () => {
    const stealthModeManager = {
      handleMouseLeave: vi.fn(),
      handleMouseEnter: vi.fn()
    }
    const { registerStealthMouseHandlers } = await import('../../src/main/ipc-handlers')
    registerStealthMouseHandlers(stealthModeManager as any, () => true)

    handlers[IPC_CHANNELS.STEALTH_MOUSE_LEAVE]({})
    handlers[IPC_CHANNELS.STEALTH_MOUSE_ENTER]({})
    expect(stealthModeManager.handleMouseLeave).toHaveBeenCalledOnce()
    expect(stealthModeManager.handleMouseEnter).toHaveBeenCalledOnce()
  })

  it('should reject untrusted mouse events', async () => {
    const stealthModeManager = {
      handleMouseLeave: vi.fn(),
      handleMouseEnter: vi.fn()
    }
    const { registerStealthMouseHandlers } = await import('../../src/main/ipc-handlers')
    registerStealthMouseHandlers(stealthModeManager as any, () => false)

    expect(() => handlers[IPC_CHANNELS.STEALTH_MOUSE_LEAVE]({})).toThrow(
      'untrusted sender'
    )
    expect(stealthModeManager.handleMouseLeave).not.toHaveBeenCalled()
  })
})
