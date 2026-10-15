import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StealthModeManager, BrowserWindowLike, GlobalShortcutLike } from '../../src/main/stealth-mode-manager'
import type { StealthConfig } from '../../src/shared/types'
import { DEFAULT_MOUSE_RETURN_DELAY } from '../../src/shared/constants'

// Mock electron ipcMain
const handlers: Record<string, (...args: unknown[]) => unknown> = {}
let cursorPoint = { x: 0, y: 0 }
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }
  },
  screen: {
    getCursorScreenPoint: () => cursorPoint
  }
}))

function createMockWindow(): BrowserWindowLike & {
  visible: boolean
  minimized: boolean
  blurred: boolean
  focused: boolean
  alwaysOnTop: boolean
  skipTaskbar: boolean
  title: string
  sentEvents: Array<{ channel: string; args: unknown[] }>
  bounds: { x: number; y: number; width: number; height: number }
  } {
  const mock = {
    visible: true,
    minimized: false,
    blurred: false,
    focused: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'MoyuReader',
    bounds: { x: 100, y: 100, width: 900, height: 670 },
    sentEvents: [] as Array<{ channel: string; args: unknown[] }>,
    getBounds() {
      return { ...mock.bounds }
    },
    hide() {
      mock.visible = false
    },
    show() {
      mock.visible = true
    },
    minimize() {
      mock.minimized = true
      mock.visible = false
    },
    restore() {
      mock.minimized = false
      mock.visible = true
    },
    blur() {
      mock.blurred = true
      mock.focused = false
    },
    focus() {
      mock.focused = true
      mock.blurred = false
    },
    setAlwaysOnTop(flag: boolean) {
      mock.alwaysOnTop = flag
    },
    setSkipTaskbar(skip: boolean) {
      mock.skipTaskbar = skip
    },
    setTitle(title: string) {
      mock.title = title
    },
    webContents: {
      send(channel: string, ...args: unknown[]) {
        mock.sentEvents.push({ channel, args })
      }
    }
  }
  return mock
}

function createDefaultConfig(): StealthConfig {
  return {
    hideShortcut: 'CommandOrControl+Shift+H',
    mouseLeaveDelay: 0,
    hideAnimation: 'opacity'
  }
}

describe('StealthModeManager', () => {
  let manager: StealthModeManager
  let mockWindow: ReturnType<typeof createMockWindow>
  let config: StealthConfig
  let quitApplication: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useRealTimers()
    cursorPoint = { x: 0, y: 0 }
    manager = new StealthModeManager()
    mockWindow = createMockWindow()
    config = createDefaultConfig()
    quitApplication = vi.fn()
    manager.initialize(mockWindow, config)
  })

  describe('initialize()', () => {
    it('should set initial state to not hidden', () => {
      expect(manager.isHidden()).toBe(false)
    })

    it('should have no saved state initially', () => {
      expect(manager.getLastState()).toBeNull()
    })
  })

  describe('hide()', () => {
    it('should hide the BrowserWindow', () => {
      manager.hide()
      expect(mockWindow.visible).toBe(false)
    })

    it('should set skipTaskbar to true', () => {
      manager.hide()
      expect(mockWindow.skipTaskbar).toBe(true)
    })

    it('should mark state as hidden', () => {
      manager.hide()
      expect(manager.isHidden()).toBe(true)
    })

    it('should save current reading state before hiding', () => {
      manager.updateReadingState({ chapterIndex: 5, scrollPosition: 300 })
      manager.hide()

      const savedState = manager.getLastState()
      expect(savedState).toEqual({ chapterIndex: 5, scrollPosition: 300 })
    })

    it('should send stealth:hidden event to renderer', () => {
      manager.hide()
      expect(mockWindow.sentEvents).toContainEqual({ channel: 'stealth:hidden', args: [] })
    })

    it('should not hide again if already hidden', () => {
      manager.hide()
      mockWindow.sentEvents = []

      manager.hide()

      // No additional events should be sent
      expect(mockWindow.sentEvents).toHaveLength(0)
    })

    it('should do nothing if not initialized with a window', () => {
      const uninitializedManager = new StealthModeManager()
      // Should not throw
      uninitializedManager.hide()
      expect(uninitializedManager.isHidden()).toBe(false)
    })
  })

  describe('show()', () => {
    it('should show the BrowserWindow', () => {
      manager.hide()
      manager.show()
      expect(mockWindow.visible).toBe(true)
    })

    it('should set skipTaskbar to false', () => {
      manager.hide()
      manager.show()
      expect(mockWindow.skipTaskbar).toBe(false)
    })

    it('should mark state as not hidden', () => {
      manager.hide()
      manager.show()
      expect(manager.isHidden()).toBe(false)
    })

    it('should send stealth:shown event to renderer', () => {
      manager.hide()
      manager.show()
      expect(mockWindow.sentEvents).toContainEqual({ channel: 'stealth:shown', args: [] })
    })

    it('should not show if not currently hidden', () => {
      manager.show()
      // Should remain not hidden and no events sent
      expect(manager.isHidden()).toBe(false)
      expect(mockWindow.sentEvents).toHaveLength(0)
    })

    it('should do nothing if not initialized with a window', () => {
      const uninitializedManager = new StealthModeManager()
      uninitializedManager.show()
      expect(uninitializedManager.isHidden()).toBe(false)
    })
  })

  describe('isHidden()', () => {
    it('should return false initially', () => {
      expect(manager.isHidden()).toBe(false)
    })

    it('should return true after hide()', () => {
      manager.hide()
      expect(manager.isHidden()).toBe(true)
    })

    it('should return false after hide() then show()', () => {
      manager.hide()
      manager.show()
      expect(manager.isHidden()).toBe(false)
    })
  })

  describe('getLastState()', () => {
    it('should return null before any hide operation', () => {
      expect(manager.getLastState()).toBeNull()
    })

    it('should return the reading state saved at hide time', () => {
      manager.updateReadingState({ chapterIndex: 3, scrollPosition: 150 })
      manager.hide()

      expect(manager.getLastState()).toEqual({ chapterIndex: 3, scrollPosition: 150 })
    })

    it('should preserve last state after show()', () => {
      manager.updateReadingState({ chapterIndex: 7, scrollPosition: 500 })
      manager.hide()
      manager.show()

      // Last state should still be available after showing
      expect(manager.getLastState()).toEqual({ chapterIndex: 7, scrollPosition: 500 })
    })

    it('should update last state on subsequent hides', () => {
      manager.updateReadingState({ chapterIndex: 1, scrollPosition: 100 })
      manager.hide()
      manager.show()

      manager.updateReadingState({ chapterIndex: 4, scrollPosition: 400 })
      manager.hide()

      expect(manager.getLastState()).toEqual({ chapterIndex: 4, scrollPosition: 400 })
    })

    it('should save a snapshot, not a reference to current state', () => {
      manager.updateReadingState({ chapterIndex: 2, scrollPosition: 200 })
      manager.hide()

      // Update reading state after hide
      manager.updateReadingState({ chapterIndex: 10, scrollPosition: 999 })

      // Last state should still reflect the state at hide time
      expect(manager.getLastState()).toEqual({ chapterIndex: 2, scrollPosition: 200 })
    })
  })

  describe('updateReadingState()', () => {
    it('should update the current reading state', () => {
      manager.updateReadingState({ chapterIndex: 5, scrollPosition: 250 })
      manager.hide()

      expect(manager.getLastState()).toEqual({ chapterIndex: 5, scrollPosition: 250 })
    })

    it('should handle zero values', () => {
      manager.updateReadingState({ chapterIndex: 0, scrollPosition: 0 })
      manager.hide()

      expect(manager.getLastState()).toEqual({ chapterIndex: 0, scrollPosition: 0 })
    })
  })

  describe('destroy()', () => {
    it('should reset hidden state', () => {
      manager.hide()
      manager.destroy()
      expect(manager.isHidden()).toBe(false)
    })

    it('should clear last state', () => {
      manager.updateReadingState({ chapterIndex: 3, scrollPosition: 100 })
      manager.hide()
      manager.destroy()
      expect(manager.getLastState()).toBeNull()
    })

    it('should not throw when calling hide after destroy', () => {
      manager.destroy()
      expect(() => manager.hide()).not.toThrow()
    })

    it('should not throw when calling show after destroy', () => {
      manager.destroy()
      expect(() => manager.show()).not.toThrow()
    })

    it('should disable mouse tracking on destroy', () => {
      manager.enableMouseTracking()
      manager.destroy()
      expect(manager.isMouseTrackingEnabled()).toBe(false)
    })
  })

  describe('enableMouseTracking() / disableMouseTracking()', () => {
    it('should be disabled by default', () => {
      expect(manager.isMouseTrackingEnabled()).toBe(false)
    })

    it('should enable mouse tracking', () => {
      manager.enableMouseTracking()
      expect(manager.isMouseTrackingEnabled()).toBe(true)
    })

    it('should disable mouse tracking', () => {
      manager.enableMouseTracking()
      manager.disableMouseTracking()
      expect(manager.isMouseTrackingEnabled()).toBe(false)
    })
  })

  describe('handleMouseLeave()', () => {
    it('should call hide() when mouse tracking is enabled', () => {
      manager.enableMouseTracking()
      manager.handleMouseLeave()
      expect(manager.isHidden()).toBe(true)
      expect(mockWindow.visible).toBe(false)
      expect(mockWindow.skipTaskbar).toBe(true)
    })

    it('should not call hide() when mouse tracking is disabled', () => {
      manager.handleMouseLeave()
      expect(manager.isHidden()).toBe(false)
      expect(mockWindow.visible).toBe(true)
    })

    it('should save reading state before hiding on mouse leave', () => {
      manager.enableMouseTracking()
      manager.updateReadingState({ chapterIndex: 2, scrollPosition: 150 })
      manager.handleMouseLeave()
      expect(manager.getLastState()).toEqual({ chapterIndex: 2, scrollPosition: 150 })
    })

    it('should not hide again if already hidden', () => {
      manager.enableMouseTracking()
      manager.handleMouseLeave()
      mockWindow.sentEvents = []

      manager.handleMouseLeave()
      expect(mockWindow.sentEvents).toHaveLength(0)
    })

    it('should quit the whole app when quit mode is enabled', () => {
      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'quit'
      }, quitApplication)
      quitManager.enableMouseTracking()

      quitManager.handleMouseLeave()

      expect(quitApplication).toHaveBeenCalledOnce()
      expect(mockWindow.visible).toBe(true)
      expect(quitManager.isHidden()).toBe(false)
    })

    it('should only request app quit once for repeated mouse leave events', () => {
      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'quit'
      }, quitApplication)
      quitManager.enableMouseTracking()

      quitManager.handleMouseLeave()
      quitManager.handleMouseLeave()

      expect(quitApplication).toHaveBeenCalledOnce()
    })

    it('should hide the window and quit after the deferred delay', () => {
      vi.useFakeTimers()
      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'deferred-quit',
        mouseLeaveDelay: 3000
      }, quitApplication)
      quitManager.enableMouseTracking()

      quitManager.handleMouseLeave()

      expect(mockWindow.blurred).toBe(true)
      expect(mockWindow.alwaysOnTop).toBe(false)
      expect(mockWindow.visible).toBe(false)
      expect(mockWindow.skipTaskbar).toBe(true)
      expect(quitManager.isHidden()).toBe(true)
      expect(quitApplication).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2999)
      expect(quitApplication).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(quitApplication).toHaveBeenCalledOnce()
    })

    it('should ignore renderer mouseleave when the cursor is still inside the native window', () => {
      vi.useFakeTimers()
      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'deferred-quit',
        mouseLeaveDelay: 3000
      }, quitApplication)
      quitManager.enableMouseTracking()

      // Simulate moving from the renderer into the native title bar.
      cursorPoint = { x: 500, y: 105 }
      quitManager.handleMouseLeave()
      vi.advanceTimersByTime(3000)

      expect(quitApplication).not.toHaveBeenCalled()
      expect(mockWindow.blurred).toBe(false)
      expect(mockWindow.alwaysOnTop).toBe(true)
    })

    it('should keep hide and quit actions inside the native window boundary', () => {
      cursorPoint = { x: 500, y: 105 }
      manager.enableMouseTracking()
      manager.handleMouseLeave()
      expect(manager.isHidden()).toBe(false)

      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, { ...config, mouseLeaveAction: 'quit' }, quitApplication)
      quitManager.enableMouseTracking()
      quitManager.handleMouseLeave()
      expect(quitApplication).not.toHaveBeenCalled()
    })

    it('should re-check the cursor position before deferred quit', () => {
      vi.useFakeTimers()
      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'deferred-quit',
        mouseLeaveDelay: 3000
      }, quitApplication)
      quitManager.enableMouseTracking()

      cursorPoint = { x: 50, y: 50 }
      quitManager.handleMouseLeave()
      expect(mockWindow.blurred).toBe(true)
      expect(quitManager.isHidden()).toBe(true)

      // The pointer returns to the native window without a renderer mouseenter.
      cursorPoint = { x: 500, y: 105 }
      vi.advanceTimersByTime(3000)

      expect(quitApplication).not.toHaveBeenCalled()
      expect(mockWindow.focused).toBe(true)
      expect(mockWindow.blurred).toBe(false)
      expect(mockWindow.visible).toBe(true)
      expect(quitManager.isHidden()).toBe(false)
    })

    it('should restore focus and cancel quit when renderer reports mouseenter', () => {
      vi.useFakeTimers()
      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'deferred-quit',
        mouseLeaveDelay: 3000
      }, quitApplication)
      quitManager.enableMouseTracking()

      quitManager.handleMouseLeave()
      quitManager.handleMouseEnter()
      vi.advanceTimersByTime(3000)

      expect(quitApplication).not.toHaveBeenCalled()
      expect(mockWindow.visible).toBe(true)
      expect(mockWindow.focused).toBe(true)
      expect(quitManager.isHidden()).toBe(false)
    })

    it('should not schedule duplicate deferred quit timers for repeated mouseleave events', () => {
      vi.useFakeTimers()
      const quitManager = new StealthModeManager()
      quitManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'deferred-quit',
        mouseLeaveDelay: 3000
      }, quitApplication)
      quitManager.enableMouseTracking()

      quitManager.handleMouseLeave()
      quitManager.handleMouseLeave()
      vi.advanceTimersByTime(3000)

      expect(quitApplication).toHaveBeenCalledOnce()
    })

    it('should delay hiding when mouseLeaveDelay is configured', () => {
      vi.useFakeTimers()
      const delayedManager = new StealthModeManager()
      delayedManager.initialize(mockWindow, {
        ...config,
        mouseLeaveDelay: 200
      })
      delayedManager.enableMouseTracking()

      delayedManager.handleMouseLeave()
      expect(delayedManager.isHidden()).toBe(false)

      vi.advanceTimersByTime(199)
      expect(delayedManager.isHidden()).toBe(false)

      vi.advanceTimersByTime(1)
      expect(delayedManager.isHidden()).toBe(true)
    })

    it('should re-check the native window boundary before delayed hide', () => {
      vi.useFakeTimers()
      const delayedManager = new StealthModeManager()
      delayedManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'hide',
        mouseLeaveDelay: 200
      })
      delayedManager.enableMouseTracking()

      cursorPoint = { x: 50, y: 50 }
      delayedManager.handleMouseLeave()
      cursorPoint = { x: 500, y: 105 }
      vi.advanceTimersByTime(200)

      expect(delayedManager.isHidden()).toBe(false)
      expect(mockWindow.visible).toBe(true)
      expect(delayedManager.getState()).toBe('visible')
    })

    it('should apply updated mouse leave config on the next mouseleave', () => {
      vi.useFakeTimers()
      const configurableManager = new StealthModeManager()
      configurableManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'hide',
        mouseLeaveDelay: 200
      }, quitApplication)
      configurableManager.enableMouseTracking()

      configurableManager.updateMouseLeaveConfig({
        mouseLeaveAction: 'deferred-quit',
        mouseLeaveDelay: 3000
      })
      configurableManager.handleMouseLeave()

      expect(configurableManager.isHidden()).toBe(true)
      expect(quitApplication).not.toHaveBeenCalled()
      vi.advanceTimersByTime(3000)
      expect(quitApplication).toHaveBeenCalledOnce()
    })

    it('should cancel delayed hiding when mouse enters before the delay elapses', () => {
      vi.useFakeTimers()
      const delayedManager = new StealthModeManager()
      delayedManager.initialize(mockWindow, {
        ...config,
        mouseLeaveDelay: 200
      })
      delayedManager.enableMouseTracking()

      delayedManager.handleMouseLeave()
      vi.advanceTimersByTime(100)
      delayedManager.handleMouseEnter()
      vi.advanceTimersByTime(200)

      expect(delayedManager.isHidden()).toBe(false)
      expect(mockWindow.visible).toBe(true)
    })

    it('should restore a hidden window when stealth tracking is disabled', () => {
      manager.enableMouseTracking()
      manager.hide(true)

      manager.disableMouseTracking()

      expect(manager.isMouseTrackingEnabled()).toBe(false)
      expect(manager.isHidden()).toBe(false)
      expect(manager.getState()).toBe('visible')
      expect(mockWindow.visible).toBe(true)
    })

    it('should cancel the old hidden state when mouse leave settings change', () => {
      manager.enableMouseTracking()
      manager.hide(true)

      manager.updateMouseLeaveConfig({
        mouseLeaveAction: 'quit',
        mouseLeaveDelay: 9000
      })

      expect(manager.isHidden()).toBe(false)
      expect(manager.getState()).toBe('visible')
      expect(mockWindow.visible).toBe(true)
      expect(mockWindow.sentEvents).toContainEqual({ channel: 'stealth:shown', args: [] })
    })
  })

  describe('handleMouseEnter()', () => {
    it('should call show() when mouse tracking is enabled and window is hidden', () => {
      manager.enableMouseTracking()
      manager.hide()
      manager.handleMouseEnter()
      expect(manager.isHidden()).toBe(false)
      expect(mockWindow.visible).toBe(true)
      expect(mockWindow.skipTaskbar).toBe(false)
    })

    it('should not call show() when mouse tracking is disabled', () => {
      manager.hide()
      manager.handleMouseEnter()
      // Still hidden because tracking is disabled
      expect(manager.isHidden()).toBe(true)
    })

    it('should not call show() when window is not hidden', () => {
      manager.enableMouseTracking()
      manager.handleMouseEnter()
      // No events sent since window was already visible
      expect(mockWindow.sentEvents).toHaveLength(0)
    })

    it('should restore window after mouse leave then mouse enter', () => {
      manager.enableMouseTracking()
      manager.updateReadingState({ chapterIndex: 5, scrollPosition: 300 })

      manager.handleMouseLeave()
      expect(manager.isHidden()).toBe(true)

      manager.handleMouseEnter()
      expect(manager.isHidden()).toBe(false)
      expect(mockWindow.visible).toBe(true)
      expect(mockWindow.skipTaskbar).toBe(false)
    })

    it('should restore window when cursor returns to hidden window bounds', () => {
      vi.useFakeTimers()
      manager.enableMouseTracking()

      cursorPoint = { x: 50, y: 50 }
      manager.handleMouseLeave()
      expect(manager.isHidden()).toBe(true)

      cursorPoint = { x: 150, y: 150 }
      vi.advanceTimersByTime(100)
      vi.advanceTimersByTime(2000)

      expect(manager.isHidden()).toBe(false)
      expect(mockWindow.visible).toBe(true)
      expect(mockWindow.skipTaskbar).toBe(false)
    })

    it('should not restore window until cursor dwells in the return hot zone', () => {
      vi.useFakeTimers()
      manager.enableMouseTracking()

      cursorPoint = { x: 50, y: 50 }
      manager.handleMouseLeave()
      expect(manager.isHidden()).toBe(true)

      cursorPoint = { x: 150, y: 150 }
      vi.advanceTimersByTime(100)
      expect(manager.isHidden()).toBe(true)

      vi.advanceTimersByTime(1900)
      expect(manager.isHidden()).toBe(true)

      vi.advanceTimersByTime(100)
      expect(manager.isHidden()).toBe(false)
    })

    it('should use the configured show delay for the return hot zone', () => {
      vi.useFakeTimers()
      const delayedShowManager = new StealthModeManager()
      delayedShowManager.initialize(mockWindow, {
        ...config,
        mouseLeaveAction: 'hide',
        mouseLeaveDelay: 0,
        mouseReturnDelay: 5000
      })
      delayedShowManager.enableMouseTracking()

      cursorPoint = { x: 50, y: 50 }
      delayedShowManager.handleMouseLeave()
      expect(delayedShowManager.isHidden()).toBe(true)

      cursorPoint = { x: 150, y: 150 }
      vi.advanceTimersByTime(100)
      vi.advanceTimersByTime(4900)
      expect(delayedShowManager.isHidden()).toBe(true)

      vi.advanceTimersByTime(100)
      expect(delayedShowManager.isHidden()).toBe(false)
    })

    it('should restore window inside the margin around hidden bounds', () => {
      vi.useFakeTimers()
      manager.enableMouseTracking()

      cursorPoint = { x: 50, y: 50 }
      manager.handleMouseLeave()
      expect(manager.isHidden()).toBe(true)

      cursorPoint = { x: 95, y: 95 }
      vi.advanceTimersByTime(2100)

      expect(manager.isHidden()).toBe(false)
    })

    it('should not restore window when cursor stays outside hidden window bounds', () => {
      vi.useFakeTimers()
      manager.enableMouseTracking()

      cursorPoint = { x: 50, y: 50 }
      manager.handleMouseLeave()
      vi.advanceTimersByTime(300)

      expect(manager.isHidden()).toBe(true)
      expect(mockWindow.visible).toBe(false)
    })

    it('should not use return hot zone for direct hide calls', () => {
      vi.useFakeTimers()
      manager.enableMouseTracking()

      cursorPoint = { x: 150, y: 150 }
      manager.hide()
      vi.advanceTimersByTime(300)

      expect(manager.isHidden()).toBe(true)
      expect(mockWindow.visible).toBe(false)
    })
  })

  describe('registerShortcut()', () => {
    function createMockGlobalShortcut(): GlobalShortcutLike & {
      registeredCallbacks: Map<string, () => void>
      unregisteredKeys: string[]
      } {
      const mock = {
        registeredCallbacks: new Map<string, () => void>(),
        unregisteredKeys: [] as string[],
        register(accelerator: string, callback: () => void): boolean {
          mock.registeredCallbacks.set(accelerator, callback)
          return true
        },
        unregister(accelerator: string): void {
          mock.registeredCallbacks.delete(accelerator)
          mock.unregisteredKeys.push(accelerator)
        },
        isRegistered(accelerator: string): boolean {
          return mock.registeredCallbacks.has(accelerator)
        }
      }
      return mock
    }

    it('should register the configured shortcut', () => {
      const mockShortcut = createMockGlobalShortcut()
      manager.registerShortcut(mockShortcut)

      expect(mockShortcut.registeredCallbacks.has('CommandOrControl+Shift+H')).toBe(true)
    })

    it('should hide window when shortcut is pressed and window is visible', () => {
      const mockShortcut = createMockGlobalShortcut()
      manager.registerShortcut(mockShortcut)

      // Simulate shortcut press
      const callback = mockShortcut.registeredCallbacks.get('CommandOrControl+Shift+H')!
      callback()

      expect(manager.isHidden()).toBe(true)
      expect(mockWindow.visible).toBe(false)
      expect(mockWindow.skipTaskbar).toBe(true)
    })

    it('should show window when shortcut is pressed and window is hidden', () => {
      const mockShortcut = createMockGlobalShortcut()
      manager.registerShortcut(mockShortcut)

      // First press: hide
      manager.hide()
      expect(manager.isHidden()).toBe(true)

      // Second press via shortcut: show
      const callback = mockShortcut.registeredCallbacks.get('CommandOrControl+Shift+H')!
      callback()

      expect(manager.isHidden()).toBe(false)
      expect(mockWindow.visible).toBe(true)
      expect(mockWindow.skipTaskbar).toBe(false)
    })

    it('should toggle visibility on repeated shortcut presses', () => {
      const mockShortcut = createMockGlobalShortcut()
      manager.registerShortcut(mockShortcut)

      const callback = mockShortcut.registeredCallbacks.get('CommandOrControl+Shift+H')!

      // Press 1: hide
      callback()
      expect(manager.isHidden()).toBe(true)

      // Press 2: show
      callback()
      expect(manager.isHidden()).toBe(false)

      // Press 3: hide again
      callback()
      expect(manager.isHidden()).toBe(true)
    })

    it('should not register if not initialized with config', () => {
      const uninitializedManager = new StealthModeManager()
      const mockShortcut = createMockGlobalShortcut()

      uninitializedManager.registerShortcut(mockShortcut)

      expect(mockShortcut.registeredCallbacks.size).toBe(0)
    })

    it('should use custom shortcut from config', () => {
      const customConfig: StealthConfig = {
        hideShortcut: 'CommandOrControl+Shift+X',
        mouseLeaveDelay: 0,
        hideAnimation: 'opacity'
      }
      const customManager = new StealthModeManager()
      customManager.initialize(mockWindow, customConfig)

      const mockShortcut = createMockGlobalShortcut()
      customManager.registerShortcut(mockShortcut)

      expect(mockShortcut.registeredCallbacks.has('CommandOrControl+Shift+X')).toBe(true)
    })

    it('should report a failed shortcut registration to the renderer', () => {
      const mockShortcut = createMockGlobalShortcut()
      mockShortcut.register = vi.fn().mockReturnValue(false)

      const result = manager.registerShortcut(mockShortcut)

      expect(result).toBe(false)
      expect(mockWindow.sentEvents).toContainEqual({
        channel: 'stealth:shortcutFailed',
        args: [{ accelerator: 'CommandOrControl+Shift+H' }]
      })
    })
  })

  describe('unregisterShortcut()', () => {
    function createMockGlobalShortcut(): GlobalShortcutLike & {
      registeredCallbacks: Map<string, () => void>
      unregisteredKeys: string[]
      } {
      const mock = {
        registeredCallbacks: new Map<string, () => void>(),
        unregisteredKeys: [] as string[],
        register(accelerator: string, callback: () => void): boolean {
          mock.registeredCallbacks.set(accelerator, callback)
          return true
        },
        unregister(accelerator: string): void {
          mock.registeredCallbacks.delete(accelerator)
          mock.unregisteredKeys.push(accelerator)
        },
        isRegistered(accelerator: string): boolean {
          return mock.registeredCallbacks.has(accelerator)
        }
      }
      return mock
    }

    it('should unregister the shortcut', () => {
      const mockShortcut = createMockGlobalShortcut()
      manager.registerShortcut(mockShortcut)
      manager.unregisterShortcut()

      expect(mockShortcut.unregisteredKeys).toContain('CommandOrControl+Shift+H')
    })

    it('should be called on destroy()', () => {
      const mockShortcut = createMockGlobalShortcut()
      manager.registerShortcut(mockShortcut)
      manager.destroy()

      expect(mockShortcut.unregisteredKeys).toContain('CommandOrControl+Shift+H')
    })

    it('should not throw if no shortcut was registered', () => {
      expect(() => manager.unregisterShortcut()).not.toThrow()
    })
  })

  describe('setDisguise()', () => {
    it('should set window title to code-editor theme title', () => {
      manager.setDisguise('code-editor')
      expect(mockWindow.title).toBe('reader.ts - workspace')
    })

    it('should set window title to code theme title', () => {
      manager.setDisguise('code')
      expect(mockWindow.title).toBe('reader.ts - workspace')
    })

    it('should set window title to terminal theme title', () => {
      manager.setDisguise('terminal')
      expect(mockWindow.title).toBe('zsh — 120×34')
    })

    it('should store the current disguise theme', () => {
      manager.setDisguise('code-editor')
      expect(manager.getCurrentDisguise()).toBe('code-editor')
    })

    it('should update disguise theme when changed', () => {
      manager.setDisguise('code-editor')
      manager.setDisguise('terminal')
      expect(manager.getCurrentDisguise()).toBe('terminal')
      expect(mockWindow.title).toBe('zsh — 120×34')
    })

    it('should not throw if window is not initialized', () => {
      const uninitializedManager = new StealthModeManager()
      expect(() => uninitializedManager.setDisguise('code-editor')).not.toThrow()
      expect(uninitializedManager.getCurrentDisguise()).toBe('code-editor')
    })

    it('should reset disguise on destroy', () => {
      manager.setDisguise('terminal')
      manager.destroy()
      expect(manager.getCurrentDisguise()).toBeNull()
    })
  })

  describe('getCurrentDisguise()', () => {
    it('should return null initially', () => {
      expect(manager.getCurrentDisguise()).toBeNull()
    })

    it('should return the set disguise theme', () => {
      manager.setDisguise('terminal')
      expect(manager.getCurrentDisguise()).toBe('terminal')
    })
  })

  describe('registerIPCHandlers()', () => {
    beforeEach(() => {
      // Clear handlers before each test in this block
      Object.keys(handlers).forEach((key) => delete handlers[key])
    })

    it('should register stealth:setDisguise handler', () => {
      manager.registerIPCHandlers(() => true)
      expect(handlers['stealth:setDisguise']).toBeDefined()
    })

    it('should register stealth:hide handler', () => {
      manager.registerIPCHandlers(() => true)
      expect(handlers['stealth:hide']).toBeDefined()
    })

    it('should call setDisguise when stealth:setDisguise handler is invoked', () => {
      manager.registerIPCHandlers(() => true)
      handlers['stealth:setDisguise']({}, 'paper')
      expect(manager.getCurrentDisguise()).toBe('paper')
      expect(mockWindow.title).toBe('index.ts - moyureader')
    })

    it('should call hide when stealth:hide handler is invoked', () => {
      manager.registerIPCHandlers(() => true)
      handlers['stealth:hide']({})
      expect(manager.isHidden()).toBe(true)
      expect(mockWindow.visible).toBe(false)
    })

    it('should reject IPC calls from an untrusted sender', () => {
      manager.registerIPCHandlers(() => false)

      expect(() => handlers['stealth:hide']({})).toThrow('untrusted sender')
      expect(manager.isHidden()).toBe(false)
    })

    it('should reject an invalid disguise theme', () => {
      manager.registerIPCHandlers(() => true)

      expect(() => handlers['stealth:setDisguise']({}, 'neon')).toThrow(
        'Invalid disguise theme'
      )
      expect(manager.getCurrentDisguise()).toBeNull()
    })
  })

  describe('platform stealth hooks', () => {
    it('hides the dock icon while hidden and restores it on show', () => {
      const setDockVisible = vi.fn()
      manager.setPlatformHooks({ setDockVisible })

      manager.hide()
      expect(setDockVisible).toHaveBeenLastCalledWith(false)

      manager.show()
      expect(setDockVisible).toHaveBeenLastCalledWith(true)
    })

    it('does not touch the dock when no hook is injected', () => {
      // 默认无钩子时不应抛错（Linux/Windows 及测试环境）。
      expect(() => manager.hide()).not.toThrow()
      expect(() => manager.show()).not.toThrow()
    })

    it('flushes pending work before quitting the application', () => {
      const beforeQuit = vi.fn()
      manager.setPlatformHooks({ beforeQuit })
      manager.initialize(mockWindow, config, quitApplication)

      manager.updateMouseLeaveConfig({ mouseLeaveAction: 'quit' })
      manager.enableMouseTracking()
      manager.handleMouseLeave()

      expect(beforeQuit).toHaveBeenCalledTimes(1)
      expect(quitApplication).toHaveBeenCalledTimes(1)
    })

    it('still quits when the pre-quit hook throws', () => {
      manager.setPlatformHooks({
        beforeQuit: () => {
          throw new Error('disk full')
        }
      })
      manager.initialize(mockWindow, config, quitApplication)

      manager.updateMouseLeaveConfig({ mouseLeaveAction: 'quit' })
      manager.enableMouseTracking()
      manager.handleMouseLeave()

      // 收尾失败不能阻止退出，否则窗口会卡在不可见状态。
      expect(quitApplication).toHaveBeenCalledTimes(1)
    })

    it('emits stealth:hidden before quitting so the renderer can flush progress', () => {
      // 自动退出路径会先 hide() 再 quit()。渲染进程的进度防抖依赖
      // stealth:hidden 事件落盘，因此该事件必须早于退出发生，
      // 否则最后一个保存周期内的阅读进度会丢。
      const beforeQuit = vi.fn()
      const order: string[] = []
      manager.setPlatformHooks({
        beforeQuit: () => {
          order.push('beforeQuit')
          beforeQuit()
        }
      })
      manager.initialize(mockWindow, config, () => order.push('quit'))
      manager.updateMouseLeaveConfig({ mouseLeaveAction: 'quit' })
      manager.enableMouseTracking()
      manager.handleMouseLeave()

      const hiddenIndex = mockWindow.sentEvents.findIndex(
        (event) => event.channel === 'stealth:hidden'
      )
      expect(hiddenIndex).toBeGreaterThanOrEqual(0)
      expect(order).toEqual(['beforeQuit', 'quit'])
      expect(beforeQuit).toHaveBeenCalledTimes(1)
    })
  })

  describe('return hot-zone polling', () => {
    it('polls less often while the cursor is far from the hot zone', () => {
      vi.useFakeTimers()
      try {
        manager.initialize(mockWindow, config)
        manager.enableMouseTracking()
        manager.hide(true)

        // 指针远离热区：100ms 的慢档不应触发检查。
        cursorPoint = { x: 5000, y: 5000 }
        vi.advanceTimersByTime(100)
        expect(manager.isHidden()).toBe(true)

        // 慢档间隔到达后仍会检查一次，但指针不在热区所以保持隐藏。
        vi.advanceTimersByTime(500)
        expect(manager.isHidden()).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('restores the window once the cursor returns to the hot zone', () => {
      vi.useFakeTimers()
      try {
        manager.initialize(mockWindow, config)
        manager.enableMouseTracking()
        manager.hide(true)

        // 回到隐藏前的窗口矩形内。默认显形延迟是 DEFAULT_MOUSE_RETURN_DELAY，
        // 需要跨过该延迟加上一轮轮询间隔才会恢复。
        cursorPoint = { x: 300, y: 300 }
        vi.advanceTimersByTime(DEFAULT_MOUSE_RETURN_DELAY + 600)

        expect(manager.isHidden()).toBe(false)
        expect(mockWindow.visible).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
