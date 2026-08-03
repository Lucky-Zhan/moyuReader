import { ipcMain, screen } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS } from '../shared/ipc-channels'
import type { StealthConfig, DisguiseTheme } from '../shared/types'
import { DEFAULT_MOUSE_LEAVE_QUIT_DELAY } from '../shared/constants'
import { assertTrustedIpcSender, type IpcSenderValidator } from './ipc-security'

type LegacyDisguiseTheme = 'code-editor' | 'terminal'

const RETURN_HOT_ZONE_POLL_INTERVAL = 100
const DEFAULT_MOUSE_LEAVE_DELAY = 200
const RETURN_HOT_ZONE_MARGIN = 12
const RETURN_HOT_ZONE_DWELL_TIME = 2000
const WINDOW_CURSOR_MARGIN = 1

/** globalShortcut 接口（仅使用到的方法） */
export interface GlobalShortcutLike {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  isRegistered(accelerator: string): boolean
}

/** BrowserWindow 接口（仅使用到的方法） */
export interface BrowserWindowLike {
  getBounds(): { x: number; y: number; width: number; height: number }
  hide(): void
  show(): void
  blur?(): void
  focus?(): void
  setAlwaysOnTop?(flag: boolean): void
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
 * 隐藏时使用 BrowserWindow.hide()，确保 Windows、macOS 和 Linux 行为一致。
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
  private quitApplication: (() => void) | null = null
  private quitting = false
  private deferredQuitTimer: ReturnType<typeof setTimeout> | null = null
  private deferredQuitPending = false

  /**
   * 初始化隐蔽模式管理器
   * @param window BrowserWindow 实例
   * @param config 隐蔽模式配置
   */
  initialize(
    window: BrowserWindowLike,
    config: StealthConfig,
    quitApplication?: () => void
  ): void {
    this.cancelMouseLeaveHide()
    this.stopReturnHotZoneTracking()
    this.cancelDeferredQuit(false)
    this.window = window
    this.config = config
    this.quitApplication = quitApplication ?? null
    this.hidden = false
    this.lastState = null
    this.mouseTrackingEnabled = false
    this.quitting = false
  }

  /**
   * 隐藏窗口
   * 使用 BrowserWindow.hide() + setSkipTaskbar(true) 隐藏窗口。
   * 隐藏前保存当前阅读状态。
   */
  hide(trackReturnHotZone = false): void {
    if (!this.window || this.hidden) {
      return
    }

    // 保存隐藏前的阅读状态
    this.lastState = { ...this.currentReadingState }
    this.hiddenBounds = this.window.getBounds()

    this.window.setSkipTaskbar(true)
    this.window.hide()

    this.hidden = true

    // 通知渲染进程
    this.window.webContents.send(IPC_EVENTS.STEALTH_HIDDEN)

    if (trackReturnHotZone) {
      this.startReturnHotZoneTracking()
    }
  }

  /**
   * 显示窗口
   * 恢复任务栏显示并重新显示窗口。
   */
  show(): void {
    if (!this.window) {
      return
    }

    // 原地热区恢复时可能没有 renderer mouseenter，先取消待退出状态。
    if (this.deferredQuitPending) {
      this.cancelDeferredQuit(false)
    }

    if (!this.hidden) {
      return
    }

    this.window.setSkipTaskbar(false)
    this.window.show()
    this.window.focus?.()

    this.hidden = false
    this.stopReturnHotZoneTracking()

    // 通知渲染进程
    this.window.webContents.send(IPC_EVENTS.STEALTH_SHOWN)
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
   * 启用后，渲染进程发送的 mouseLeave/mouseEnter IPC 消息将触发配置的行为。
   */
  enableMouseTracking(): void {
    this.mouseTrackingEnabled = true
  }

  /**
   * 禁用鼠标追踪
   * 禁用后，渲染进程发送的 mouseLeave/mouseEnter IPC 消息不会触发隐蔽行为。
   */
  disableMouseTracking(): void {
    this.mouseTrackingEnabled = false
    this.cancelMouseLeaveHide()
    this.cancelDeferredQuit(true)
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
   * 当鼠标追踪启用时，按配置隐藏窗口或退出整个应用。
   */
  handleMouseLeave(): void {
    if (!this.mouseTrackingEnabled || this.quitting) {
      return
    }

    switch (this.config?.mouseLeaveAction) {
      case 'quit':
        this.quit()
        return
      case 'deferred-quit':
        this.scheduleDeferredQuit()
        return
      default:
        this.scheduleMouseLeaveHide()
    }
  }

  /**
   * 处理鼠标移入窗口区域事件（由渲染进程通过 IPC 调用）
   * 当鼠标追踪启用时，触发 show()。
   */
  handleMouseEnter(): void {
    if (this.quitting) {
      return
    }

    if (this.deferredQuitPending) {
      this.cancelDeferredQuit(true)
      return
    }

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
      case 'code':
      case 'code-editor':
        this.window.setTitle(theme === 'code' || theme === 'code-editor' ? 'reader.ts - workspace' : 'index.ts - moyureader')
        break
      case 'terminal':
        this.window.setTitle('zsh — 120×34')
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
  registerIPCHandlers(isTrustedSender: IpcSenderValidator): void {
    ipcMain.handle(
      IPC_CHANNELS.STEALTH_SET_DISGUISE,
      (event, theme: unknown) => {
        assertTrustedIpcSender(event, isTrustedSender)
        if (!isDisguiseTheme(theme)) {
          throw new TypeError('Invalid disguise theme')
        }
        this.setDisguise(theme)
      }
    )

    ipcMain.handle(IPC_CHANNELS.STEALTH_HIDE, (event) => {
      assertTrustedIpcSender(event, isTrustedSender)
      this.hide()
    })
  }

  /**
   * 注册全局快捷键
   * 快捷键触发时切换隐藏/显示状态（toggle 行为）
   * @param globalShortcut Electron globalShortcut 模块实例
   */
  registerShortcut(globalShortcut: GlobalShortcutLike): boolean {
    if (!this.config) {
      return false
    }

    this.unregisterShortcut()
    this.globalShortcut = globalShortcut
    const accelerator = this.config.hideShortcut

    const registered = globalShortcut.register(accelerator, () => {
      this.toggleVisibility()
    })

    if (!registered) {
      this.window?.webContents.send(IPC_EVENTS.STEALTH_SHORTCUT_FAILED, {
        accelerator
      })
      return false
    }

    this.registeredShortcut = accelerator
    return true
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

  /**
   * 鼠标离开内容区后先真正隐藏窗口，给用户一个短暂的返回机会，超时后再退出应用。
   *
   * 仅 blur/setAlwaysOnTop(false) 在 macOS 上不一定会改变窗口 z-order；这里复用
   * hide(true) 的原地热区，让窗口可靠离开当前层级，同时仍可通过鼠标回到原位置恢复。
   */
  private scheduleDeferredQuit(): void {
    this.cancelMouseLeaveHide()

    if (!this.window || this.deferredQuitPending) {
      return
    }

    // renderer 的 mouseleave 可能在指针移到原生标题栏/窗口边框时触发。
    // 这类移动仍发生在 BrowserWindow 内，不应启动退出倒计时。
    if (this.isCursorInsideWindowBounds()) {
      return
    }

    this.deferredQuitPending = true
    this.window.setAlwaysOnTop?.(false)
    this.window.blur?.()
    this.hide(true)

    const delay = this.config?.mouseLeaveDelay ?? DEFAULT_MOUSE_LEAVE_QUIT_DELAY
    if (delay <= 0) {
      this.quit()
      return
    }

    this.deferredQuitTimer = setTimeout(() => {
      this.deferredQuitTimer = null
      if (!this.deferredQuitPending) {
        return
      }

      // 退出前再次确认指针仍在整个窗口之外。这样即使 renderer 没有收到
      // mouseenter（例如指针停在原生标题栏），也不会误退出。
      if (this.isCursorInsideWindowBounds()) {
        this.cancelDeferredQuit(true)
        return
      }

      this.quit()
    }, delay)

    const quitTimer = this.deferredQuitTimer as { unref?: () => void }
    quitTimer.unref?.()
  }

  private cancelDeferredQuit(restoreWindow: boolean): void {
    if (this.deferredQuitTimer !== null) {
      clearTimeout(this.deferredQuitTimer)
      this.deferredQuitTimer = null
    }

    const shouldRestore = restoreWindow && this.window && this.deferredQuitPending
    this.deferredQuitPending = false

    if (shouldRestore && this.window) {
      if (this.hidden) {
        this.show()
      } else {
        this.window.show()
      }
      this.window.focus?.()
    }
  }

  /** 请求退出整个应用，避免重复触发退出回调。 */
  private quit(): void {
    if (this.quitting) {
      return
    }

    this.quitting = true
    this.cancelMouseLeaveHide()
    this.cancelDeferredQuit(false)
    this.stopReturnHotZoneTracking()
    this.quitApplication?.()
  }

  private cancelMouseLeaveHide(): void {
    if (this.mouseLeaveTimer !== null) {
      clearTimeout(this.mouseLeaveTimer)
      this.mouseLeaveTimer = null
    }
  }

  /** 判断鼠标是否仍在 BrowserWindow（包含原生标题栏）范围内。 */
  private isCursorInsideWindowBounds(): boolean {
    if (!this.window) return false

    const point = screen.getCursorScreenPoint()
    const { x, y, width, height } = this.window.getBounds()
    return (
      point.x >= x - WINDOW_CURSOR_MARGIN &&
      point.x <= x + width + WINDOW_CURSOR_MARGIN &&
      point.y >= y - WINDOW_CURSOR_MARGIN &&
      point.y <= y + height + WINDOW_CURSOR_MARGIN
    )
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
    this.cancelDeferredQuit(false)
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
    this.quitApplication = null
    this.quitting = false
  }
}

function isDisguiseTheme(value: unknown): value is DisguiseTheme {
  return value === 'dark' || value === 'light' || value === 'paper' || value === 'code' || value === 'terminal'
}
