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
    getBookContent: vi.fn().mockReturnValue('这是书籍内容')
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
      autoSaveInterval: 30000
    }),
    setFontSize: vi.fn(),
    setFontFamily: vi.fn(),
    setLineHeight: vi.fn(),
    setDisguiseTheme: vi.fn(),
    setStealthEnabled: vi.fn()
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
    registerBookshelfHandlers(mockManager as any)
  })

  it('should register all required IPC channels', () => {
    expect(handlers[IPC_CHANNELS.BOOKSHELF_GET_ALL]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_REMOVE]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_PROGRESS]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_GET_PROGRESS]).toBeDefined()
    expect(handlers[IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE]).toBeDefined()
    expect(handlers[IPC_CHANNELS.READER_GET_CONTENT]).toBeDefined()
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
})

describe('registerSettingsHandlers', () => {
  let mockManager: ReturnType<typeof createMockSettingsManager>

  beforeEach(async () => {
    Object.keys(handlers).forEach(key => delete handlers[key])
    mockManager = createMockSettingsManager()

    const { registerSettingsHandlers } = await import('../../src/main/ipc-handlers')
    registerSettingsHandlers(mockManager as any)
  })

  it('should register all required settings IPC channels', () => {
    expect(handlers[IPC_CHANNELS.SETTINGS_GET]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_FONT_SIZE]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_FONT_FAMILY]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_LINE_HEIGHT]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_DISGUISE_THEME]).toBeDefined()
    expect(handlers[IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED]).toBeDefined()
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

  it('settings:setStealthEnabled should call the optional side-effect callback', async () => {
    Object.keys(handlers).forEach(key => delete handlers[key])
    const onStealthEnabledChange = vi.fn()
    const { registerSettingsHandlers } = await import('../../src/main/ipc-handlers')
    registerSettingsHandlers(mockManager as any, onStealthEnabledChange)

    handlers[IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED]({}, false)
    expect(onStealthEnabledChange).toHaveBeenCalledWith(false)
  })
})
