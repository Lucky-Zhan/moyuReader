import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { BookshelfManager } from './bookshelf-manager'
import type { BookmarkInput, ReadingProgress, DisguiseTheme } from '../shared/types'
import type { SettingsManager } from './settings-manager'
import type { StealthModeManager } from './stealth-mode-manager'
import {
  ALLOWED_FONT_FAMILIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  MAX_TITLE_LENGTH
} from '../shared/constants'
import { assertTrustedIpcSender, type IpcSenderValidator } from './ipc-security'

/**
 * 注册书架相关 IPC handlers
 * 将 Renderer 进程的 IPC 调用桥接到 BookshelfManager 方法
 */
export function registerBookshelfHandlers(
  bookshelfManager: BookshelfManager,
  isTrustedSender: IpcSenderValidator
): void {
  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_GET_ALL, (event) => {
    assertTrustedIpcSender(event, isTrustedSender)
    return bookshelfManager.getAllBooks()
  })

  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_REMOVE, (event, bookId: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    bookshelfManager.removeBook(bookId)
  })

  ipcMain.handle(
    IPC_CHANNELS.BOOKSHELF_UPDATE_PROGRESS,
    (event, bookId: unknown, progress: unknown) => {
      assertTrustedIpcSender(event, isTrustedSender)
      assertBookId(bookId)
      assertReadingProgress(progress)
      bookshelfManager.updateProgress(bookId, progress)
    }
  )

  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_GET_PROGRESS, (event, bookId: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    return bookshelfManager.getProgress(bookId)
  })

  ipcMain.handle(IPC_CHANNELS.BOOKSHELF_UPDATE_TITLE, (event, bookId: unknown, title: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    const normalizedTitle = validateTitle(title)
    bookshelfManager.updateTitle(bookId, normalizedTitle)
  })

  ipcMain.handle(IPC_CHANNELS.READER_GET_CONTENT, (event, bookId: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    return bookshelfManager.getBookContent(bookId)
  })

  ipcMain.handle(IPC_CHANNELS.READER_OPEN, (event, bookId: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    return bookshelfManager.openBook(bookId)
  })

  ipcMain.handle(
    IPC_CHANNELS.READER_GET_CHAPTER_CONTENT,
    (event, bookId: unknown, chapterIndex: unknown) => {
      assertTrustedIpcSender(event, isTrustedSender)
      assertBookId(bookId)
      assertChapterIndex(chapterIndex)
      return bookshelfManager.getChapterContent(bookId, chapterIndex)
    }
  )

  ipcMain.handle(IPC_CHANNELS.READER_SEARCH, (event, bookId: unknown, query: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    const normalizedQuery = validateSearchQuery(query)
    return bookshelfManager.searchBook(bookId, normalizedQuery)
  })

  ipcMain.handle(IPC_CHANNELS.BOOKMARKS_GET, (event, bookId: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    return bookshelfManager.getBookmarks(bookId)
  })

  ipcMain.handle(
    IPC_CHANNELS.BOOKMARKS_ADD,
    (event, bookId: unknown, input: unknown) => {
      assertTrustedIpcSender(event, isTrustedSender)
      assertBookId(bookId)
      const bookmarkInput = validateBookmarkInput(input)
      return bookshelfManager.addBookmark(bookId, bookmarkInput)
    }
  )

  ipcMain.handle(IPC_CHANNELS.BOOKMARKS_REMOVE, (event, bookId: unknown, bookmarkId: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertBookId(bookId)
    assertBookId(bookmarkId)
    bookshelfManager.removeBookmark(bookId, bookmarkId)
  })
}

/**
 * 注册设置相关 IPC handlers
 */
export function registerSettingsHandlers(
  settingsManager: SettingsManager,
  isTrustedSender: IpcSenderValidator,
  onStealthEnabledChange?: (enabled: boolean) => void
): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (event) => {
    assertTrustedIpcSender(event, isTrustedSender)
    return settingsManager.getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_FONT_SIZE, (event, size: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertNumberInStepRange(size, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, 'font size')
    settingsManager.setFontSize(size)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_FONT_FAMILY, (event, font: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    if (
      typeof font !== 'string' ||
      !ALLOWED_FONT_FAMILIES.includes(font as (typeof ALLOWED_FONT_FAMILIES)[number])
    ) {
      throw new TypeError('Invalid font family')
    }
    settingsManager.setFontFamily(font)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_LINE_HEIGHT, (event, lineHeight: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    assertNumberInStepRange(
      lineHeight,
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX,
      LINE_HEIGHT_STEP,
      'line height'
    )
    settingsManager.setLineHeight(lineHeight)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_DISGUISE_THEME, (event, theme: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    if (!isDisguiseTheme(theme)) {
      throw new TypeError('Invalid disguise theme')
    }
    settingsManager.setDisguiseTheme(theme)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_STEALTH_ENABLED, (event, enabled: unknown) => {
    assertTrustedIpcSender(event, isTrustedSender)
    if (typeof enabled !== 'boolean') {
      throw new TypeError('Invalid stealth mode state')
    }
    settingsManager.setStealthEnabled(enabled)
    onStealthEnabledChange?.(enabled)
  })
}

/** 注册鼠标隐身交互 IPC handlers。 */
export function registerStealthMouseHandlers(
  stealthModeManager: StealthModeManager,
  isTrustedSender: IpcSenderValidator
): void {
  ipcMain.handle(IPC_CHANNELS.STEALTH_MOUSE_LEAVE, (event) => {
    assertTrustedIpcSender(event, isTrustedSender)
    stealthModeManager.handleMouseLeave()
  })

  ipcMain.handle(IPC_CHANNELS.STEALTH_MOUSE_ENTER, (event) => {
    assertTrustedIpcSender(event, isTrustedSender)
    stealthModeManager.handleMouseEnter()
  })
}

function assertBookId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200 || value.trim() !== value) {
    throw new TypeError('Invalid book id')
  }
}

function assertReadingProgress(value: unknown): asserts value is ReadingProgress {
  if (!isRecord(value)) {
    throw new TypeError('Invalid reading progress')
  }

  const { chapterIndex, scrollPosition, percentage } = value
  if (
    !Number.isInteger(chapterIndex) ||
    (chapterIndex as number) < 0 ||
    typeof scrollPosition !== 'number' ||
    !Number.isFinite(scrollPosition) ||
    scrollPosition < 0 ||
    !Number.isInteger(percentage) ||
    (percentage as number) < 0 ||
    (percentage as number) > 100
  ) {
    throw new TypeError('Invalid reading progress')
  }
}

function assertChapterIndex(value: unknown): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError('Invalid chapter index')
  }
}

function validateTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Invalid book title')
  }
  const title = value.trim()
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    throw new TypeError('Invalid book title')
  }
  return title
}

function validateSearchQuery(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Invalid search query')
  }
  const query = value.trim()
  if (query.length === 0 || query.length > 100) {
    throw new TypeError('Invalid search query')
  }
  return query
}

function validateBookmarkInput(value: unknown): BookmarkInput {
  if (!isRecord(value)) {
    throw new TypeError('Invalid bookmark')
  }

  const progress = {
    chapterIndex: value.chapterIndex,
    scrollPosition: value.scrollPosition,
    percentage: value.percentage
  }
  assertReadingProgress(progress)

  if (typeof value.title !== 'string' || typeof value.excerpt !== 'string') {
    throw new TypeError('Invalid bookmark')
  }

  const title = value.title.trim()
  const excerpt = value.excerpt.trim()
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH || excerpt.length > 120) {
    throw new TypeError('Invalid bookmark')
  }

  return {
    chapterIndex: progress.chapterIndex,
    scrollPosition: progress.scrollPosition,
    percentage: progress.percentage,
    title,
    excerpt
  }
}

function assertNumberInStepRange(
  value: unknown,
  min: number,
  max: number,
  step: number,
  label: string
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`Invalid ${label}`)
  }

  const steps = (value - min) / step
  if (Math.abs(steps - Math.round(steps)) > 1e-9) {
    throw new TypeError(`Invalid ${label}`)
  }
}

function isDisguiseTheme(value: unknown): value is DisguiseTheme {
  return value === 'dark' || value === 'light' || value === 'paper' || value === 'code' || value === 'terminal'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
