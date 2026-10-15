import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { BookshelfManager } from './bookshelf-manager'
import { FileImporter } from './file-importer'
import { ChapterParser } from './chapter-parser'
import { SettingsManager } from './settings-manager'
import { StealthModeManager } from './stealth-mode-manager'
import { AutoSaveManager } from './auto-save-manager'
import {
  registerBookshelfHandlers,
  registerSettingsHandlers,
  registerStealthMouseHandlers
} from './ipc-handlers'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { DEFAULT_HIDE_SHORTCUT } from '../shared/constants'
import { assertTrustedIpcSender } from './ipc-security'
import { ensureSingleInstanceLock } from './single-instance'
import { registerBackupHandlers } from './backup-handlers'
import type { BookImportResult, ImportResult, ReadingProgress } from '../shared/types'

interface ApplicationModules {
  bookshelfManager: BookshelfManager
  fileImporter: FileImporter
  chapterParser: ChapterParser
  settingsManager: SettingsManager
  stealthModeManager: StealthModeManager
}

let mainWindow: BrowserWindow | null = null
let modules: ApplicationModules | null = null
let autoSaveManager: AutoSaveManager | null = null

/**
 * 渲染进程最近一次上报的阅读位置。
 *
 * 自动保存需要一个“当前进度”来源：渲染进程不再主动定时上报，而是由主进程
 * 每 30 秒取这里缓存的值落盘，避免窗口隐藏/关闭时丢失最后一段阅读位置。
 */
let latestReadingPosition: { bookId: string; progress: ReadingProgress } | null = null

// 拖动时允许窗口贴近屏幕边缘，但至少保留一块可见区域，避免窗口只剩
// 一条边缘、隐身热区也随之落到屏幕外，导致用户误以为应用“消失”。
const MIN_VISIBLE_WINDOW_WIDTH = 520
const MIN_VISIBLE_WINDOW_HEIGHT = 240

const hasSingleInstanceLock = ensureSingleInstanceLock(app, () => mainWindow)

function isTrustedIpcSender(event: IpcMainInvokeEvent): boolean {
  return (
    mainWindow !== null &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents
  )
}

/**
 * 应用级模块和 IPC handlers 只初始化一次。
 * macOS 重建窗口时只重新绑定窗口级资源，避免重复注册 ipcMain.handle。
 */
function initializeApplication(): void {
  if (modules) return

  const store = new Store()
  const bookshelfManager = new BookshelfManager()
  const fileImporter = new FileImporter()
  const chapterParser = new ChapterParser()
  const settingsManager = new SettingsManager(store)
  const stealthModeManager = new StealthModeManager()

  modules = {
    bookshelfManager,
    fileImporter,
    chapterParser,
    settingsManager,
    stealthModeManager
  }

  ipcMain.handle(IPC_CHANNELS.FILE_IMPORT, async (event) => {
    assertTrustedIpcSender(event, isTrustedIpcSender)

    const importResult = await fileImporter.importFile()
    return importBookToShelf(importResult, bookshelfManager, chapterParser)
  })

  ipcMain.handle(IPC_CHANNELS.FILE_IMPORT_MANY, async (event) => {
    assertTrustedIpcSender(event, isTrustedIpcSender)
    const importResults = await fileImporter.importFiles()
    return importResults.map((importResult) => {
      try {
        return importBookToShelf(importResult, bookshelfManager, chapterParser)
      } catch (error) {
        return {
          success: false,
          error: {
            code: 'IMPORT_FAILED',
            message: error instanceof Error ? error.message : '导入失败'
          }
        } satisfies BookImportResult
      }
    })
  })

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_DRAG_START,
    (event) => {
      assertTrustedIpcSender(event, isTrustedIpcSender)
      stealthModeManager.beginWindowInteraction()
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_MOVE_BY,
    (event, deltaX: unknown, deltaY: unknown) => {
      assertTrustedIpcSender(event, isTrustedIpcSender)
      assertWindowMoveDelta(deltaX)
      assertWindowMoveDelta(deltaY)

      const window = mainWindow
      if (!window || window.isDestroyed()) return

      const bounds = window.getBounds()
      const nextPosition = constrainWindowPosition(
        bounds,
        bounds.x + Math.round(deltaX),
        bounds.y + Math.round(deltaY)
      )
      if (nextPosition.x !== bounds.x || nextPosition.y !== bounds.y) {
        window.setPosition(nextPosition.x, nextPosition.y, false)
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_DRAG_END,
    (event) => {
      assertTrustedIpcSender(event, isTrustedIpcSender)
      stealthModeManager.endWindowInteraction()
    }
  )

  registerBookshelfHandlers(bookshelfManager, isTrustedIpcSender, (bookId, progress) => {
    latestReadingPosition = { bookId, progress }
  })
  registerBackupHandlers(bookshelfManager, isTrustedIpcSender)
  stealthModeManager.registerIPCHandlers(isTrustedIpcSender)
  registerStealthMouseHandlers(stealthModeManager, isTrustedIpcSender)
  registerSettingsHandlers(
    settingsManager,
    isTrustedIpcSender,
    (enabled) => {
      if (enabled) {
        stealthModeManager.enableMouseTracking()
      } else {
        stealthModeManager.disableMouseTracking()
        stealthModeManager.show()
      }
    },
    (config) => {
      stealthModeManager.updateMouseLeaveConfig(config)
    }
  )
}

function importBookToShelf(
  importResult: ImportResult,
  bookshelfManager: BookshelfManager,
  chapterParser: ChapterParser
): BookImportResult {
  if (!importResult.success || !importResult.book) {
    return {
      success: false,
      error: importResult.error
    }
  }

  const chapters = chapterParser.parse(importResult.book.content)
  try {
    const bookMeta = bookshelfManager.addBook(importResult.book, chapters)
    return { success: true, bookMeta }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'IMPORT_FAILED',
        message: error instanceof Error ? error.message : '导入失败'
      }
    }
  }
}

function assertWindowMoveDelta(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1000) {
    throw new TypeError('Invalid window move delta')
  }
}

function constrainWindowPosition(
  bounds: { x: number; y: number; width: number; height: number },
  nextX: number,
  nextY: number
): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({
    x: nextX + bounds.width / 2,
    y: nextY + bounds.height / 2
  })
  const workArea = display.workArea
  const visibleWidth = Math.min(bounds.width, workArea.width, MIN_VISIBLE_WINDOW_WIDTH)
  const visibleHeight = Math.min(bounds.height, workArea.height, MIN_VISIBLE_WINDOW_HEIGHT)
  const minX = workArea.x - bounds.width + visibleWidth
  const maxX = workArea.x + workArea.width - visibleWidth
  const minY = workArea.y - bounds.height + visibleHeight
  const maxY = workArea.y + workArea.height - visibleHeight

  return {
    x: clamp(nextX, minX, maxX),
    y: clamp(nextY, minY, maxY)
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.max(min, Math.min(value, max))
}

function createWindow(): void {
  if (!modules) {
    throw new Error('Application modules must be initialized before creating a window')
  }

  const window = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 520,
    minHeight: 360,
    resizable: true,
    frame: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 13 },
    transparent: false,
    skipTaskbar: false,
    show: false,
    title: 'index.ts - moyureader',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  })

  const initialBounds = window.getBounds()
  const visiblePosition = constrainWindowPosition(initialBounds, initialBounds.x, initialBounds.y)
  if (visiblePosition.x !== initialBounds.x || visiblePosition.y !== initialBounds.y) {
    window.setPosition(visiblePosition.x, visiblePosition.y, false)
  }

  mainWindow = window
  hardenWindow(window)

  const settings = modules.settingsManager.getSettings()
  modules.stealthModeManager.setPlatformHooks({
    // macOS 上 hide() 不会移除 Dock 图标与 Cmd+Tab 条目，
    // 对「不被发现」这个核心诉求来说必须一并隐藏。
    setDockVisible: (visible) => {
      if (process.platform !== 'darwin' || !app.dock) return
      if (visible) {
        void app.dock.show()
      } else {
        app.dock.hide()
      }
    },
    // 鼠标移出触发的自动退出不走窗口 closed 流程，退出前补一次落盘。
    beforeQuit: () => {
      autoSaveManager?.flush()
      autoSaveManager?.stopAutoSave()
      autoSaveManager = null
    }
  })
  modules.stealthModeManager.initialize(window, {
    hideShortcut: settings.hideShortcut || DEFAULT_HIDE_SHORTCUT,
    mouseLeaveAction: settings.mouseLeaveAction,
    mouseLeaveDelay: settings.mouseLeaveDelay,
    mouseReturnDelay: settings.mouseReturnDelay,
    hideAnimation: 'hide'
  }, () => app.quit())
  modules.stealthModeManager.setDisguise(settings.disguiseTheme || 'dark')
  if (settings.stealthEnabled) {
    modules.stealthModeManager.enableMouseTracking()
  }

  autoSaveManager = new AutoSaveManager(modules.bookshelfManager, window)

  // 阅读位置由渲染进程实时上报，主进程每 30 秒落盘一次。
  // 之前 AutoSaveManager 只被创建、从未 startAutoSave()，需求 5.5 实际未生效。
  autoSaveManager.startAutoSave(() => latestReadingPosition?.bookId ?? null, () => latestReadingPosition?.progress ?? null)

  window.once('ready-to-show', () => {
    if (window.isDestroyed() || mainWindow !== window) return
    window.show()
    modules?.stealthModeManager.registerShortcut(globalShortcut)
  })

  window.on('closed', () => {
    if (mainWindow !== window) return

    // 关闭前把最后一次阅读位置落盘，避免丢掉最后 30 秒的进度。
    autoSaveManager?.flush()
    autoSaveManager?.stopAutoSave()
    autoSaveManager = null
    latestReadingPosition = null
    modules?.stealthModeManager.destroy()
    mainWindow = null
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false)
    }
  )
}

if (hasSingleInstanceLock) {
  app
    .whenReady()
    .then(() => {
      // 进程名会出现在活动监视器、Cmd+Tab 和 macOS 菜单栏里。
      // 打包后默认是 productName（MoyuReader），与伪装主题的窗口标题不一致，
      // 等于在系统层面直接暴露了这是个阅读器。
      if (process.platform === 'darwin') {
        app.setName('workspace')
      }

      initializeApplication()
      createWindow()

      app.on('activate', () => {
        if (!mainWindow) {
          createWindow()
        }
      })
    })
    .catch((error) => {
      // 启动失败必须留下痕迹并退出，否则会留下一个没有窗口的僵尸进程。
      console.error('Failed to start application:', error)
      app.exit(1)
    })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('will-quit', () => {
    autoSaveManager?.stopAutoSave()
    autoSaveManager = null
    modules?.stealthModeManager.destroy()
    globalShortcut.unregisterAll()
  })
}
