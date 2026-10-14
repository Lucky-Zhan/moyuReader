import { vi } from 'vitest'
import type { MoyuApi } from '../../src/shared/moyu-api'

export function createMockApi(): MoyuApi {
  return {
    window: {
      drag: {
        start: vi.fn().mockResolvedValue(undefined),
        moveBy: vi.fn().mockResolvedValue(undefined),
        end: vi.fn().mockResolvedValue(undefined)
      }
    },
    file: {
      import: vi.fn().mockResolvedValue(null),
      importMany: vi.fn().mockResolvedValue([])
    },
    bookshelf: {
      getAll: vi.fn().mockResolvedValue([]),
      getLibrary: vi.fn().mockResolvedValue([]),
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
      setStealthEnabled: vi.fn().mockResolvedValue(undefined),
      setMouseLeaveAction: vi.fn().mockResolvedValue(undefined),
      setMouseLeaveDelay: vi.fn().mockResolvedValue(undefined),
      setMouseReturnDelay: vi.fn().mockResolvedValue(undefined)
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

/**
 * 取出 mock API 上某个事件订阅注册的回调，供测试主动触发主进程事件。
 *
 * 例如主进程的全局快捷键会直接隐藏窗口，渲染进程只能通过 stealth:hidden
 * 事件得知，测试需要手动派发这个事件来覆盖该路径。
 */
export function getRegisteredEventHandler(
  api: MoyuApi,
  event: 'onStealthHidden' | 'onStealthShown'
): (() => void) | undefined {
  const spy = api.events[event] as unknown as { mock: { calls: unknown[][] } }
  const lastCall = spy.mock.calls.at(-1)
  return lastCall?.[0] as (() => void) | undefined
}
