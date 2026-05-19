import { ipcMain, screen } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { StealthConfig, ReadingProgress, DisguiseTheme } from '../shared/types'

type LegacyDisguiseTheme = 'code-editor' | 'terminal'

const RETURN_HOT_ZONE_POLL_INTERVAL = 100
const DEFAULT_MOUSE_LEAVE_DELAY = 200
const RETURN_HOT_ZONE_MARGIN = 12
const RETURN_HOT_ZONE_DWELL_TIME = 100

/** globalShortcut 接口（仅使用到的方法） */
export interface GlobalShortcutLike {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  isRegistered(accelerator: string): boolean
}

/** BrowserWindow 接口（仅使用到的方法） */
export interface BrowserWindowLike {
  getBounds(): { x: number; y: number; width: number; height: number }
  setOpacity(opacity: number): void
  setSkipTaskbar(skip: boolean): void
  setTitle(title: string): void
  webContents: {
    send(channel: string, ...args: unknown[]): void
  }
}

/** 隐藏前保存的阅读状态 */
export interface SavedReadingState {
  chapterIndex: number
  scrollPosition: number
}

/**
 * 隐蔽模式管理器
 *
 * 负责窗口的隐藏/显示逻辑，包括保存和恢复阅读状态。
 * 隐藏时使用 opacity=0 + skipTaskbar=true，确保窗口在 200ms 内不可见。
 */
export class StealthModeManager {
  private window: BrowserWindowLike | null = null
  private config: StealthConfig | null = null
  private hidden = false
  private lastState: SavedReadingState | null = null
  private currentReadingState: SavedReadingState = { chapterIndex: 0, scrollPosition: 0 }
  private globalShortcut: GlobalShortcutLike | null = null
  private registeredShortcut: string | null = null
  private mouseTrackingEnabled = false
  private currentDisguise: DisguiseTheme | LegacyDisguiseTheme | null = null
  private hiddenBounds: { x: number; y: number; width: number; height: number } | null = null
  private returnHotZoneTimer: ReturnType<typeof setInterval> | null = null
  private mouseLeaveTimer: ReturnType<typeof setTimeout> | null = null
  private returnHotZoneEnteredAt: number | null = null

  /**
   * 初始化隐蔽模式管理器
   * @param window BrowserWindow 实例
   * @param config 隐蔽模式配置
   */
  initialize(window: BrowserWindowLike, config: StealthConfig): void {
    this.window = window
    this.config = config
    this.hidden = false
    this.lastState = null
    this.mouseTrackingEnabled = false
  }

  /**
   * 隐藏窗口
   * 使用 setOpacity(0) + setSkipTaskbar(true) 在 200ms 内隐藏窗口。
   * 隐藏前保存当前阅读状态。
   */
  hide(trackReturnHotZone = false): void {
    if (!this.window || this.hidden) {
      return
    }

    // 保存隐藏前的阅读状态
    this.lastState = { ...this.currentReadingState }
    this.hiddenBounds = this.window.getBounds()

    // 设置窗口不可见
    this.window.setOpacity(0)
    this.window.setSkipTaskbar(true)

    this.hidden = true

    // 通知渲染进程
    this.window.webContents.send('stealth:hidden')

    if (trackReturnHotZone) {
      this.startReturnHotZoneTracking()
    }
  }

  /**
   * 显示窗口
   * 恢复 opacity 为 1，setSkipTaskbar 为 false。
   */
  show(): void {
    if (!this.window || !this.hidden) {
      return
    }

    // 恢复窗口可见
    this.window.setOpacity(1)
    this.window.setSkipTaskbar(false)

    this.hidden = false
    this.stopReturnHotZoneTracking()

    // 通知渲染进程
    this.window.webContents.send('stealth:shown')
  }

  /**
   * 获取当前隐蔽状态
   */
  isHidden(): boolean {
    return this.hidden
  }

  /**
   * 获取隐藏前保存的阅读状态
   */
  getLastState(): SavedReadingState | null {
    return this.lastState
  }

  /**
   * 更新当前阅读状态（由阅读控制器调用）
   * @param state 当前阅读状态
   */
  updateReadingState(state: SavedReadingState): void {
    this.currentReadingState = { ...state }
  }

  /**
   * 启用鼠标追踪
   * 启用后，渲染进程发送的 mouseLeave/mouseEnter IPC 消息将触发 hide()/show()。
   */
  enableMouseTracking(): void {
    this.mouseTrackingEnabled = true
  }

  /**
   * 禁用鼠标追踪
   * 禁用后，渲染进程发送的 mouseLeave/mouseEnter IPC 消息不会触发 hide()/show()。
   */
  disableMouseTracking(): void {
    this.mouseTrackingEnabled = false
    this.cancelMouseLeaveHide()
    this.stopReturnHotZoneTracking()
  }

  /**
   * 获取鼠标追踪是否启用
   */
  isMouseTrackingEnabled(): boolean {
    return this.mouseTrackingEnabled
  }

  /**
   * 处理鼠标移出窗口区域事件（由渲染进程通过 IPC 调用）
   * 当鼠标追踪启用时，触发 hide()。
   */
  handleMouseLeave(): void {
    if (this.mouseTrackingEnabled) {
      this.scheduleMouseLeaveHide()
    }
  }

  /**
   * 处理鼠标移入窗口区域事件（由渲染进程通过 IPC 调用）
   * 当鼠标追踪启用时，触发 show()。
   */
  handleMouseEnter(): void {
    this.cancelMouseLeaveHide()
    if (this.mouseTrackingEnabled) {
      this.show()
    }
  }

  /**
   * 设置伪装主题
   * 修改窗口标题以匹配伪装主题
   * @param theme 伪装主题类型
   */
  setDisguise(theme: DisguiseTheme | LegacyDisguiseTheme): void {
    this.currentDisguise = theme

    if (!this.window) {
      return
    }

    switch (theme) {
      case 'dark':
      case 'light':
      case 'paper':
      case 'code-editor':
        this.window.setTitle('index.ts - moyureader')
        break
      case 'terminal':
        this.window.setTitle('bash - 80x24')
        break
    }
  }

  /**
   * 获取当前伪装主题
   */
  getCurrentDisguise(): DisguiseTheme | LegacyDisguiseTheme | null {
    return this.currentDisguise
  }

  /**
   * 注册隐蔽模式相关的 IPC handlers
   */
  registerIPCHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.STEALTH_SET_DISGUISE, (_event, theme: DisguiseTheme | LegacyDisguiseTheme) => {
      this.setDisguise(theme)
    })

    ipcMain.handle(IPC_CHANNELS.STEALTH_HIDE, () => {
      this.hide()
    })
  }

  /**
   * 注册全局快捷键
   * 快捷键触发时切换隐藏/显示状态（toggle 行为）
   * @param globalShortcut Electron globalShortcut 模块实例
   */
  registerShortcut(globalShortcut: GlobalShortcutLike): void {
    if (!this.config) {
      return
    }

    this.globalShortcut = globalShortcut
    const accelerator = this.config.hideShortcut

    globalShortcut.register(accelerator, () => {
      this.toggleVisibility()
    })

    this.registeredShortcut = accelerator
  }

  /**
   * 注销已注册的全局快捷键
   */
  unregisterShortcut(): void {
    if (this.globalShortcut && this.registeredShortcut) {
      this.globalShortcut.unregister(this.registeredShortcut)
      this.registeredShortcut = null
    }
  }

  /**
   * 切换隐藏/显示状态
   * 如果当前隐藏则显示，如果当前可见则隐藏
   */
  private toggleVisibility(): void {
    if (this.hidden) {
      this.show()
    } else {
      this.hide()
    }
  }

  private scheduleMouseLeaveHide(): void {
    this.cancelMouseLeaveHide()

    const delay = this.config?.mouseLeaveDelay ?? DEFAULT_MOUSE_LEAVE_DELAY
    if (delay <= 0) {
      this.hide(true)
      return
    }

    this.mouseLeaveTimer = setTimeout(() => {
      this.mouseLeaveTimer = null
      this.hide(true)
    }, delay)

    const timer = this.mouseLeaveTimer as { unref?: () => void }
    timer.unref?.()
  }

  private cancelMouseLeaveHide(): void {
    if (this.mouseLeaveTimer !== null) {
      clearTimeout(this.mouseLeaveTimer)
      this.mouseLeaveTimer = null
    }
  }

  /**
   * 启动原地热区追踪：窗口隐藏后，鼠标回到隐藏前窗口矩形区域即显示。
   */
  private startReturnHotZoneTracking(): void {
    if (!this.hiddenBounds) return

    this.stopReturnHotZoneTracking()
    this.returnHotZoneTimer = setInterval(() => {
      this.showIfCursorReturnedToHotZone()
    }, RETURN_HOT_ZONE_POLL_INTERVAL)

    const timer = this.returnHotZoneTimer as { unref?: () => void }
    timer.unref?.()
  }

  private stopReturnHotZoneTracking(): void {
    if (this.returnHotZoneTimer !== null) {
      clearInterval(this.returnHotZoneTimer)
      this.returnHotZoneTimer = null
    }
    this.returnHotZoneEnteredAt = null
  }

  private showIfCursorReturnedToHotZone(): void {
    if (!this.hidden || !this.hiddenBounds || !this.mouseTrackingEnabled) return

    const point = screen.getCursorScreenPoint()
    const { x, y, width, height } = this.hiddenBounds
    const inside =
      point.x >= x - RETURN_HOT_ZONE_MARGIN &&
      point.x <= x + width + RETURN_HOT_ZONE_MARGIN &&
      point.y >= y - RETURN_HOT_ZONE_MARGIN &&
      point.y <= y + height + RETURN_HOT_ZONE_MARGIN

    if (!inside) {
      this.returnHotZoneEnteredAt = null
      return
    }

    const now = Date.now()
    if (this.returnHotZoneEnteredAt === null) {
      this.returnHotZoneEnteredAt = now
      return
    }

    if (now - this.returnHotZoneEnteredAt >= RETURN_HOT_ZONE_DWELL_TIME) {
      this.show()
    }
  }

  /**
   * 销毁管理器，清理资源
   */
  destroy(): void {
    this.unregisterShortcut()
    this.cancelMouseLeaveHide()
    this.stopReturnHotZoneTracking()
    this.window = null
    this.config = null
    this.hidden = false
    this.lastState = null
    this.hiddenBounds = null
    this.currentReadingState = { chapterIndex: 0, scrollPosition: 0 }
    this.mouseTrackingEnabled = false
    this.currentDisguise = null
    this.globalShortcut = null
  }
}
