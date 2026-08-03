import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { BookshelfManager } from './bookshelf-manager'
import { FileImporter } from './file-importer'
import { ChapterParser } from './chapter-parser'
import { ReaderController } from './reader-controller'
import { SettingsManager } from './settings-manager'
import { StealthModeManager } from './stealth-mode-manager'
import { AutoSaveManager } from './auto-save-manager'
import {
  registerBookshelfHandlers,
  registerSettingsHandlers,
  registerStealthMouseHandlers
} from './ipc-handlers'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { DEFAULT_HIDE_SHORTCUT, DEFAULT_MOUSE_LEAVE_QUIT_DELAY } from '../shared/constants'
import { assertTrustedIpcSender } from './ipc-security'
import { ensureSingleInstanceLock } from './single-instance'
import { registerBackupHandlers } from './backup-handlers'
import type { BookImportResult, ImportResult } from '../shared/types'

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

  // 保留现有阅读控制器初始化；当前 Renderer 仍通过细粒度 IPC 获取阅读数据。
  new ReaderController(bookshelfManager)

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

  registerBookshelfHandlers(bookshelfManager, isTrustedIpcSender)
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

  mainWindow = window
  hardenWindow(window)

  const settings = modules.settingsManager.getSettings()
  modules.stealthModeManager.initialize(window, {
    hideShortcut: settings.hideShortcut || DEFAULT_HIDE_SHORTCUT,
    mouseLeaveAction: 'deferred-quit',
    mouseLeaveDelay: DEFAULT_MOUSE_LEAVE_QUIT_DELAY,
    hideAnimation: 'hide'
  }, () => app.quit())
  modules.stealthModeManager.setDisguise(settings.disguiseTheme || 'dark')
  if (settings.stealthEnabled) {
    modules.stealthModeManager.enableMouseTracking()
  }

  autoSaveManager = new AutoSaveManager(modules.bookshelfManager, window)

  window.once('ready-to-show', () => {
    if (window.isDestroyed() || mainWindow !== window) return
    window.show()
    modules?.stealthModeManager.registerShortcut(globalShortcut)
  })

  window.on('closed', () => {
    if (mainWindow !== window) return

    autoSaveManager?.stopAutoSave()
    autoSaveManager = null
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
  app.whenReady().then(() => {
    initializeApplication()
    createWindow()

    app.on('activate', () => {
      if (!mainWindow) {
        createWindow()
      }
    })
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
