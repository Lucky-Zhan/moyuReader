import { vi } from 'vitest'
import type { MoyuApi } from '../../src/shared/moyu-api'

export function createMockApi(): MoyuApi {
  return {
    file: {
      import: vi.fn().mockResolvedValue(null),
      importMany: vi.fn().mockResolvedValue([])
    },
    bookshelf: {
      getAll: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      updateProgress: vi.fn().mockResolvedValue(undefined),
      getProgress: vi.fn().mockResolvedValue(null),
      updateTitle: vi.fn().mockResolvedValue(undefined)
    },
    reader: {
      open: vi.fn().mockResolvedValue(null),
      getChapterContent: vi.fn().mockResolvedValue(null),
      getContent: vi.fn().mockResolvedValue(null),
      search: vi.fn().mockResolvedValue([])
    },
    bookmarks: {
      get: vi.fn().mockResolvedValue([]),
      add: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined)
    },
    backup: {
      export: vi.fn().mockResolvedValue({ success: false }),
      restore: vi.fn().mockResolvedValue({ success: false })
    },
    settings: {
      get: vi.fn(),
      setFontSize: vi.fn().mockResolvedValue(undefined),
      setFontFamily: vi.fn().mockResolvedValue(undefined),
      setLineHeight: vi.fn().mockResolvedValue(undefined),
      setDisguiseTheme: vi.fn().mockResolvedValue(undefined),
      setStealthEnabled: vi.fn().mockResolvedValue(undefined)
    },
    stealth: {
      setDisguise: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
      mouseLeave: vi.fn().mockResolvedValue(undefined),
      mouseEnter: vi.fn().mockResolvedValue(undefined)
    },
    events: {
      onStealthHidden: vi.fn(() => vi.fn()),
      onStealthShown: vi.fn(() => vi.fn()),
      onShortcutRegistrationFailed: vi.fn(() => vi.fn()),
      onAutosaveFailed: vi.fn(() => vi.fn())
    }
  }
}
