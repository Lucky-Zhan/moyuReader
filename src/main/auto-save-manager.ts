import type { BrowserWindow } from 'electron'
import type { BookshelfManager } from './bookshelf-manager'
import type { ReadingProgress } from '../shared/types'
import { AUTO_SAVE_INTERVAL, MAX_AUTO_SAVE_RETRIES } from '../shared/constants'
import { IPC_EVENTS } from '../shared/ipc-channels'

/**
 * 自动保存管理器
 * 负责定时保存阅读进度，失败时通知渲染进程并重试
 */
export class AutoSaveManager {
  private bookshelfManager: BookshelfManager
  private window: BrowserWindow
  private timer: ReturnType<typeof setInterval> | null = null
  private failureCount: number = 0

  constructor(bookshelfManager: BookshelfManager, window: BrowserWindow) {
    this.bookshelfManager = bookshelfManager
    this.window = window
  }

  /**
   * 启动自动保存
   * @param bookId 当前阅读的书籍 ID
   * @param getProgress 获取当前阅读进度的回调函数
   */
  startAutoSave(bookId: string, getProgress: () => ReadingProgress): void {
    this.stopAutoSave()
    this.failureCount = 0

    this.timer = setInterval(() => {
      this.performSave(bookId, getProgress)
    }, AUTO_SAVE_INTERVAL)
  }

  /** 停止自动保存 */
  stopAutoSave(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** 执行一次保存操作 */
  private performSave(bookId: string, getProgress: () => ReadingProgress): void {
    try {
      const progress = getProgress()
      this.bookshelfManager.updateProgress(bookId, progress)
      // 保存成功，重置失败计数
      this.failureCount = 0
    } catch {
      this.failureCount++
      // 通知渲染进程保存失败
      this.window.webContents.send(IPC_EVENTS.AUTOSAVE_FAILED, {
        message: '保存失败，将在 30 秒后重试'
      })

      // 连续失败达到最大次数后停止自动保存
      if (this.failureCount >= MAX_AUTO_SAVE_RETRIES) {
        this.stopAutoSave()
      }
    }
  }

  /** 获取当前连续失败次数（用于测试） */
  getFailureCount(): number {
    return this.failureCount
  }

  /** 检查自动保存是否正在运行 */
  isRunning(): boolean {
    return this.timer !== null
  }
}
