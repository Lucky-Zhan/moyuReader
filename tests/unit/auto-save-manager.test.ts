import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AutoSaveManager } from '../../src/main/auto-save-manager'
import { AUTO_SAVE_INTERVAL, MAX_AUTO_SAVE_RETRIES } from '../../src/shared/constants'
import { IPC_EVENTS } from '../../src/shared/ipc-channels'
import type { ReadingProgress } from '../../src/shared/types'

// Mock BrowserWindow
function createMockWindow() {
  return {
    webContents: {
      send: vi.fn()
    }
  } as any
}

// Mock BookshelfManager
function createMockBookshelfManager(shouldFail = false) {
  return {
    updateProgress: vi.fn().mockImplementation(() => {
      if (shouldFail) {
        throw new Error('Save failed')
      }
    })
  } as any
}

describe('AutoSaveManager', () => {
  let manager: AutoSaveManager
  let mockWindow: ReturnType<typeof createMockWindow>
  let mockBookshelfManager: ReturnType<typeof createMockBookshelfManager>

  beforeEach(() => {
    vi.useFakeTimers()
    mockWindow = createMockWindow()
    mockBookshelfManager = createMockBookshelfManager()
    manager = new AutoSaveManager(mockBookshelfManager, mockWindow)
  })

  afterEach(() => {
    manager.stopAutoSave()
    vi.useRealTimers()
  })

  describe('startAutoSave()', () => {
    it('should save progress after AUTO_SAVE_INTERVAL', () => {
      const progress: ReadingProgress = { chapterIndex: 1, scrollPosition: 200, percentage: 30 }
      const getProgress = vi.fn().mockReturnValue(progress)

      manager.startAutoSave('book-1', getProgress)

      // Should not save immediately
      expect(mockBookshelfManager.updateProgress).not.toHaveBeenCalled()

      // Advance time by one interval
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)

      expect(getProgress).toHaveBeenCalledTimes(1)
      expect(mockBookshelfManager.updateProgress).toHaveBeenCalledWith('book-1', progress)
    })

    it('should save periodically at each interval', () => {
      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      manager.startAutoSave('book-1', getProgress)

      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL * 3)

      expect(getProgress).toHaveBeenCalledTimes(3)
      expect(mockBookshelfManager.updateProgress).toHaveBeenCalledTimes(3)
    })

    it('should stop previous timer when called again', () => {
      const progress1: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const progress2: ReadingProgress = { chapterIndex: 2, scrollPosition: 500, percentage: 80 }
      const getProgress1 = vi.fn().mockReturnValue(progress1)
      const getProgress2 = vi.fn().mockReturnValue(progress2)

      manager.startAutoSave('book-1', getProgress1)
      manager.startAutoSave('book-2', getProgress2)

      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)

      // Only the second auto-save should be active
      expect(getProgress1).not.toHaveBeenCalled()
      expect(getProgress2).toHaveBeenCalledTimes(1)
      expect(mockBookshelfManager.updateProgress).toHaveBeenCalledWith('book-2', progress2)
    })

    it('should reset failure count when starting new auto-save', () => {
      // Create a manager with a failing bookshelf manager
      const failingManager = createMockBookshelfManager(true)
      const mgr = new AutoSaveManager(failingManager, mockWindow)

      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      mgr.startAutoSave('book-1', getProgress)
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL) // 1 failure

      expect(mgr.getFailureCount()).toBe(1)

      // Start a new auto-save - should reset failure count
      const successManager = createMockBookshelfManager(false)
      const mgr2 = new AutoSaveManager(successManager, mockWindow)
      mgr2.startAutoSave('book-2', getProgress)

      expect(mgr2.getFailureCount()).toBe(0)

      mgr.stopAutoSave()
      mgr2.stopAutoSave()
    })
  })

  describe('stopAutoSave()', () => {
    it('should stop the timer', () => {
      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      manager.startAutoSave('book-1', getProgress)
      manager.stopAutoSave()

      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL * 5)

      expect(getProgress).not.toHaveBeenCalled()
      expect(mockBookshelfManager.updateProgress).not.toHaveBeenCalled()
    })

    it('should be safe to call when no timer is running', () => {
      expect(() => manager.stopAutoSave()).not.toThrow()
    })

    it('should set isRunning to false', () => {
      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      manager.startAutoSave('book-1', getProgress)
      expect(manager.isRunning()).toBe(true)

      manager.stopAutoSave()
      expect(manager.isRunning()).toBe(false)
    })
  })

  describe('save failure handling', () => {
    it('should send autosave:failed event on save failure', () => {
      const failingManager = createMockBookshelfManager(true)
      const mgr = new AutoSaveManager(failingManager, mockWindow)

      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      mgr.startAutoSave('book-1', getProgress)
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        IPC_EVENTS.AUTOSAVE_FAILED,
        { message: '保存失败，将在 30 秒后重试' }
      )

      mgr.stopAutoSave()
    })

    it('should increment failure count on each failure', () => {
      const failingManager = createMockBookshelfManager(true)
      const mgr = new AutoSaveManager(failingManager, mockWindow)

      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      mgr.startAutoSave('book-1', getProgress)

      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)
      expect(mgr.getFailureCount()).toBe(1)

      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)
      expect(mgr.getFailureCount()).toBe(2)

      mgr.stopAutoSave()
    })

    it('should stop auto-save after MAX_AUTO_SAVE_RETRIES consecutive failures', () => {
      const failingManager = createMockBookshelfManager(true)
      const mgr = new AutoSaveManager(failingManager, mockWindow)

      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      mgr.startAutoSave('book-1', getProgress)

      // Advance through MAX_AUTO_SAVE_RETRIES intervals
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL * MAX_AUTO_SAVE_RETRIES)

      expect(mgr.getFailureCount()).toBe(MAX_AUTO_SAVE_RETRIES)
      expect(mgr.isRunning()).toBe(false)

      // No more saves should happen
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL * 5)
      expect(failingManager.updateProgress).toHaveBeenCalledTimes(MAX_AUTO_SAVE_RETRIES)
    })

    it('should reset failure count on successful save', () => {
      let shouldFail = true
      const conditionalManager = {
        updateProgress: vi.fn().mockImplementation(() => {
          if (shouldFail) throw new Error('Save failed')
        })
      } as any

      const mgr = new AutoSaveManager(conditionalManager, mockWindow)
      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      mgr.startAutoSave('book-1', getProgress)

      // First save fails
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)
      expect(mgr.getFailureCount()).toBe(1)

      // Second save fails
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)
      expect(mgr.getFailureCount()).toBe(2)

      // Third save succeeds
      shouldFail = false
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)
      expect(mgr.getFailureCount()).toBe(0)

      mgr.stopAutoSave()
    })

    it('should continue auto-save after failure if under retry limit', () => {
      let shouldFail = true
      const conditionalManager = {
        updateProgress: vi.fn().mockImplementation(() => {
          if (shouldFail) throw new Error('Save failed')
        })
      } as any

      const mgr = new AutoSaveManager(conditionalManager, mockWindow)
      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      mgr.startAutoSave('book-1', getProgress)

      // First failure - should still be running
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)
      expect(mgr.isRunning()).toBe(true)

      // Second failure - should still be running
      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL)
      expect(mgr.isRunning()).toBe(true)

      mgr.stopAutoSave()
    })

    it('should send autosave:failed event for each failure', () => {
      const failingManager = createMockBookshelfManager(true)
      const mgr = new AutoSaveManager(failingManager, mockWindow)

      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      const getProgress = vi.fn().mockReturnValue(progress)

      mgr.startAutoSave('book-1', getProgress)

      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL * MAX_AUTO_SAVE_RETRIES)

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(MAX_AUTO_SAVE_RETRIES)

      mgr.stopAutoSave()
    })
  })

  describe('isRunning()', () => {
    it('should return false initially', () => {
      expect(manager.isRunning()).toBe(false)
    })

    it('should return true after startAutoSave', () => {
      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      manager.startAutoSave('book-1', () => progress)
      expect(manager.isRunning()).toBe(true)
    })

    it('should return false after stopAutoSave', () => {
      const progress: ReadingProgress = { chapterIndex: 0, scrollPosition: 0, percentage: 0 }
      manager.startAutoSave('book-1', () => progress)
      manager.stopAutoSave()
      expect(manager.isRunning()).toBe(false)
    })
  })
})
