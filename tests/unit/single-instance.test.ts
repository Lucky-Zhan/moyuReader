import { describe, expect, it, vi } from 'vitest'
import {
  ensureSingleInstanceLock,
  restorePrimaryWindow,
  type RestorableWindowLike,
  type SingleInstanceAppLike
} from '../../src/main/single-instance'

function createMockApp(hasLock: boolean): SingleInstanceAppLike & {
  secondInstanceListener: (() => void) | null
  quit: ReturnType<typeof vi.fn>
} {
  return {
    secondInstanceListener: null,
    requestSingleInstanceLock: vi.fn(() => hasLock),
    quit: vi.fn(),
    on(event, listener) {
      if (event === 'second-instance') {
        this.secondInstanceListener = listener
      }
    }
  }
}

function createMockWindow(overrides?: Partial<RestorableWindowLike>): RestorableWindowLike {
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    ...overrides
  }
}

describe('single instance guard', () => {
  it('should quit immediately when the single-instance lock is unavailable', () => {
    const app = createMockApp(false)

    const result = ensureSingleInstanceLock(app, () => null)

    expect(result).toBe(false)
    expect(app.quit).toHaveBeenCalledOnce()
    expect(app.secondInstanceListener).toBeNull()
  })

  it('should register a second-instance handler when the lock is acquired', () => {
    const app = createMockApp(true)

    const result = ensureSingleInstanceLock(app, () => null)

    expect(result).toBe(true)
    expect(app.quit).not.toHaveBeenCalled()
    expect(app.secondInstanceListener).toEqual(expect.any(Function))
  })

  it('should show and focus the existing window for a second instance', () => {
    const app = createMockApp(true)
    const window = createMockWindow()
    ensureSingleInstanceLock(app, () => window)

    app.secondInstanceListener!()

    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('should restore a minimized existing window before focusing it', () => {
    const window = createMockWindow({
      isMinimized: vi.fn(() => true)
    })

    restorePrimaryWindow(window)

    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('should ignore missing or destroyed windows', () => {
    const destroyedWindow = createMockWindow({
      isDestroyed: vi.fn(() => true)
    })

    restorePrimaryWindow(null)
    restorePrimaryWindow(destroyedWindow)

    expect(destroyedWindow.show).not.toHaveBeenCalled()
    expect(destroyedWindow.focus).not.toHaveBeenCalled()
  })
})
