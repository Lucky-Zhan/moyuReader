import type { BrowserWindow } from 'electron'
import type { BookshelfManager } from './bookshelf-manager'
import type { ReadingProgress } from '../shared/types'
import {
  AUTO_SAVE_INTERVAL,
  AUTO_SAVE_BACKOFF_INTERVAL,
  MAX_AUTO_SAVE_RETRIES
} from '../shared/constants'
import { IPC_EVENTS } from '../shared/ipc-channels'

/**
 * 自动保存管理器
 * 负责定时保存阅读进度，失败时通知渲染进程并按退避策略重试。
 */
export class AutoSaveManager {
  private bookshelfManager: BookshelfManager
  private window: BrowserWindow
  private timer: ReturnType<typeof setInterval> | null = null
  private failureCount: number = 0
  private getBookId: (() => string | null) | null = null
  private getProgress: (() => ReadingProgress | null) | null = null

  constructor(bookshelfManager: BookshelfManager, window: BrowserWindow) {
    this.bookshelfManager = bookshelfManager
    this.window = window
  }

  /**
   * 启动自动保存
   * @param getBookId 获取当前正在阅读的书籍 ID；返回 null 表示未在阅读
   * @param getProgress 获取当前阅读进度；返回 null 表示没有可保存的位置
   */
  startAutoSave(
    getBookId: () => string | null,
    getProgress: () => ReadingProgress | null
  ): void {
    this.stopAutoSave()
    this.failureCount = 0
    this.getBookId = getBookId
    this.getProgress = getProgress
    this.schedule(AUTO_SAVE_INTERVAL)
  }

  /**
   * 立即保存一次，用于窗口关闭等时机，避免丢掉最后一个保存周期内的进度。
   * 失败不抛出：关闭流程不应该被保存失败打断。
   */
  flush(): void {
    if (!this.getBookId || !this.getProgress) return
    this.performSave()
  }

  /** 停止自动保存 */
  stopAutoSave(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.getBookId = null
    this.getProgress = null
  }

  /** 执行一次保存操作 */
  private performSave(): void {
    const bookId = this.getBookId?.()
    const progress = this.getProgress?.()
    // 没有正在阅读的书时跳过，不产生无意义写入。
    if (!bookId || !progress) return

    try {
      this.bookshelfManager.updateProgress(bookId, progress)
      // 保存成功后恢复正常频率：磁盘写满、权限临时异常等都可能自行恢复。
      if (this.failureCount > 0) {
        this.failureCount = 0
        this.schedule(AUTO_SAVE_INTERVAL)
      }
    } catch {
      this.failureCount++
      // 通知渲染进程保存失败
      this.window.webContents.send(IPC_EVENTS.AUTOSAVE_FAILED, {
        message: '保存失败，将在稍后重试'
      })

      // 连续失败达到阈值后不再停止保存，而是转入低频退避：
      // 直接停掉会让用户后续几小时的阅读进度全部丢失。
      if (this.failureCount >= MAX_AUTO_SAVE_RETRIES) {
        this.schedule(AUTO_SAVE_BACKOFF_INTERVAL)
      }
    }
  }

  /** 重置定时器到指定间隔（幂等：会先清掉旧定时器）。 */
  private schedule(interval: number): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.timer = setInterval(() => {
      this.performSave()
    }, interval)

    const timer = this.timer as { unref?: () => void }
    timer.unref?.()
  }

  /** 获取当前连续失败次数（用于测试） */
  getFailureCount(): number {
    return this.failureCount
  }

  /** 是否处于低频退避模式（用于测试） */
  isBackingOff(): boolean {
    return this.failureCount >= MAX_AUTO_SAVE_RETRIES
  }

  /** 检查自动保存是否正在运行 */
  isRunning(): boolean {
    return this.timer !== null
  }
}
