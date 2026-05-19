import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { BookshelfManager } from './bookshelf-manager'
import type { ReadingProgress, DisguiseTheme } from '../shared/types'
import type { SettingsManager } from './settings-manager'

/**
 * 注册书架相关 IPC handlers
 * 将 Renderer 进程的 IPC 调用桥接到 BookshelfManager 方法
 */
export function registerBookshelfHandlers(bookshelfManager: BookshelfManager): void {
  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_GET_ALL, () => {
    return bookshelfManager.getAllBooks()
  })

  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_REMOVE, (_event, bookId: string) => {
    bookshelfManager.removeBook(bookId)
  })

  ipcMain.handle(
    IPC_CHANNELS.BOOKSHELF_UPDATE_PROGRESS,
    (_event, bookId: string, progress: ReadingProgress) => {
      bookshelfManager.updateProgress(bookId, progress)
    }
  )

  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_GET_PROGRESS, (_event, bookId: string) => {
    return bookshelfManager.getProgress(bookId)
  })

  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE, (_event, bookId: string, title: string) => {
    bookshelfManager.updateTitle(bookId, title)
  })

  ipcMain.handle(IPC_CHANNELS.READER_GET_CONTENT, (_event, bookId: string) => {
    return bookshelfManager.getBookContent(bookId)
  })
}

/**
 * 注册设置相关 IPC handlers
 */
export function registerSettingsHandlers(
  settingsManager: SettingsManager,
  onStealthEnabledChange?: (enabled: boolean) => void
): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settingsManager.getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_FONT_SIZE, (_event, size: number) => {
    settingsManager.setFontSize(size)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_FONT_FAMILY, (_event, font: string) => {
    settingsManager.setFontFamily(font)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_LINE_HEIGHT, (_event, lineHeight: number) => {
    settingsManager.setLineHeight(lineHeight)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_DISGUISE_THEME, (_event, theme: DisguiseTheme) => {
    settingsManager.setDisguiseTheme(theme)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED, (_event, enabled: boolean) => {
    settingsManager.setStealthEnabled(enabled)
    onStealthEnabledChange?.(enabled)
  })
}
