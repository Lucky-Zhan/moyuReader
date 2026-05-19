import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { join } from 'path'
import Store from 'electron-store'
import { BookshelfManager } from './bookshelf-manager'
import { FileImporter } from './file-importer'
import { ChapterParser } from './chapter-parser'
import { ReaderController } from './reader-controller'
import { SettingsManager } from './settings-manager'
import { StealthModeManager } from './stealth-mode-manager'
import { AutoSaveManager } from './auto-save-manager'
import { registerBookshelfHandlers, registerSettingsHandlers } from './ipc-handlers'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { DEFAULT_HIDE_SHORTCUT } from '../shared/constants'

let mainWindow: BrowserWindow | null = null
let stealthModeManager: StealthModeManager | null = null
let autoSaveManager: AutoSaveManager | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  // In development, load from dev server; in production, load from file
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function initializeModules(): void {
  if (!mainWindow) return

  // Initialize electron-store
  const store = new Store()

  // Initialize core modules
  const bookshelfManager = new BookshelfManager()
  const fileImporter = new FileImporter()
  const chapterParser = new ChapterParser()
  const readerController = new ReaderController(bookshelfManager)
  const settingsManager = new SettingsManager(store)

  // Initialize stealth mode manager
  stealthModeManager = new StealthModeManager()
  const settings = settingsManager.getSettings()
  stealthModeManager.initialize(mainWindow, {
    hideShortcut: settings.hideShortcut || DEFAULT_HIDE_SHORTCUT,
    mouseLeaveDelay: 200,
    hideAnimation: 'opacity'
  })

  stealthModeManager.setDisguise(settings.disguiseTheme || 'dark')

  if (settings.stealthEnabled) {
    stealthModeManager.enableMouseTracking()
  }

  // Initialize auto-save manager
  autoSaveManager = new AutoSaveManager(bookshelfManager, mainWindow)

  // Register IPC handlers
  // Integrated file:import handler: import → parse chapters → add to bookshelf → return BookMeta
  ipcMain.handle(IPC_CHANNELS.FILE_IMPORT, async () => {
    const importResult = await fileImporter.importFile()
    if (!importResult.success || !importResult.book) {
      return importResult
    }

    // Parse chapters from the imported content
    const chapters = chapterParser.parse(importResult.book.content)

    // Add book to bookshelf with parsed chapters
    const bookMeta = bookshelfManager.addBook(importResult.book, chapters)

    return { success: true, bookMeta }
  })

  registerBookshelfHandlers(bookshelfManager)
  stealthModeManager.registerIPCHandlers()

  registerSettingsHandlers(settingsManager, (enabled) => {
    if (enabled) {
      stealthModeManager?.enableMouseTracking()
    } else {
      stealthModeManager?.disableMouseTracking()
      stealthModeManager?.show()
    }
  })

  // Register mouse tracking IPC handlers
  ipcMain.handle(IPC_CHANNELS.STEALTH_MOUSE_LEAVE, () => {
    stealthModeManager?.handleMouseLeave()
  })

  ipcMain.handle(IPC_CHANNELS.STEALTH_MOUSE_ENTER, () => {
    stealthModeManager?.handleMouseEnter()
  })

  // Register global shortcut for stealth mode
  const hideShortcut = settings.hideShortcut || DEFAULT_HIDE_SHORTCUT
  stealthModeManager.registerShortcut(globalShortcut)
}

app.whenReady().then(() => {
  createWindow()
  initializeModules()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      initializeModules()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  // Clean up stealth mode manager (unregister shortcuts)
  if (stealthModeManager) {
    stealthModeManager.destroy()
    stealthModeManager = null
  }

  // Stop auto-save
  if (autoSaveManager) {
    autoSaveManager.stopAutoSave()
    autoSaveManager = null
  }

  // Unregister all global shortcuts
  globalShortcut.unregisterAll()
})
