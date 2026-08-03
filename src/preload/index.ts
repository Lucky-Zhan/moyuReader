import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS } from '../shared/ipc-channels'
import type {
  AutoSaveFailure,
  MoyuApi,
  ShortcutRegistrationFailure,
  Unsubscribe
} from '../shared/moyu-api'

function subscribe(
  channel: string,
  callback: (...args: unknown[]) => void
): Unsubscribe {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => {
    callback(...args)
  }
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: MoyuApi = {
  file: {
    import: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_IMPORT),
    importMany: () => ipcRenderer.invoke(IPC_CHANNELS.FILE_IMPORT_MANY)
  },
  bookshelf: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.BOOKSHELF_GET_ALL),
    remove: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.BOOKSHELF_REMOVE, bookId),
    updateProgress: (bookId, progress) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKSHELF_UPDATE_PROGRESS, bookId, progress),
    getProgress: (bookId) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKSHELF_GET_PROGRESS, bookId),
    updateTitle: (bookId, title) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE, bookId, title)
  },
  reader: {
    open: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.READER_OPEN, bookId),
    getChapterContent: (bookId, chapterIndex) =>
      ipcRenderer.invoke(IPC_CHANNELS.READER_GET_CHAPTER_CONTENT, bookId, chapterIndex),
    getContent: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.READER_GET_CONTENT, bookId),
    search: (bookId, query) => ipcRenderer.invoke(IPC_CHANNELS.READER_SEARCH, bookId, query)
  },
  bookmarks: {
    get: (bookId) => ipcRenderer.invoke(IPC_CHANNELS.BOOKMARKS_GET, bookId),
    add: (bookId, input) => ipcRenderer.invoke(IPC_CHANNELS.BOOKMARKS_ADD, bookId, input),
    remove: (bookId, bookmarkId) =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKMARKS_REMOVE, bookId, bookmarkId)
  },
  backup: {
    export: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_EXPORT),
    restore: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
    setFontSize: (size) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_FONT_SIZE, size),
    setFontFamily: (font) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_FONT_FAMILY, font),
    setLineHeight: (lineHeight) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_LINE_HEIGHT, lineHeight),
    setDisguiseTheme: (theme) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_DISGUISE_THEME, theme),
    setStealthEnabled: (enabled) =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED, enabled)
  },
  stealth: {
    setDisguise: (theme) =>
      ipcRenderer.invoke(IPC_CHANNELS.STEALTH_SET_DISGUISE, theme),
    hide: () => ipcRenderer.invoke(IPC_CHANNELS.STEALTH_HIDE),
    mouseLeave: () => ipcRenderer.invoke(IPC_CHANNELS.STEALTH_MOUSE_LEAVE),
    mouseEnter: () => ipcRenderer.invoke(IPC_CHANNELS.STEALTH_MOUSE_ENTER)
  },
  events: {
    onStealthHidden: (callback) =>
      subscribe(IPC_EVENTS.STEALTH_HIDDEN, () => callback()),
    onStealthShown: (callback) =>
      subscribe(IPC_EVENTS.STEALTH_SHOWN, () => callback()),
    onShortcutRegistrationFailed: (callback) =>
      subscribe(IPC_EVENTS.STEALTH_SHORTCUT_FAILED, (failure) =>
        callback(failure as ShortcutRegistrationFailure)
      ),
    onAutosaveFailed: (callback) =>
      subscribe(IPC_EVENTS.AUTOSAVE_FAILED, (failure) =>
        callback(failure as AutoSaveFailure)
      )
  }
}

contextBridge.exposeInMainWorld('api', api)
