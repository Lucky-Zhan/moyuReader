import type {
  AppSettings,
  Bookmark,
  BookmarkInput,
  BookImportResult,
  BookMeta,
  ChapterContent,
  DisguiseTheme,
  ReaderOpenResult,
  ReadingProgress,
  SearchResult
} from './types'

export interface FileImportResult {
  success: boolean
  bookMeta?: BookMeta
  error?: import('./types').ImportError
}

export interface BackupOperationResult {
  success: boolean
  filePath?: string
  importedBooks?: number
  error?: string
}

export interface AutoSaveFailure {
  message: string
}

export interface ShortcutRegistrationFailure {
  accelerator: string
}

export type Unsubscribe = () => void

/**
 * Renderer 可使用的最小权限 API。
 * 每个方法固定映射到一个 IPC 通道，避免暴露任意 invoke/on 能力。
 */
export interface MoyuApi {
  file: {
    import(): Promise<FileImportResult | null>
    importMany(): Promise<BookImportResult[]>
  }
  bookshelf: {
    getAll(): Promise<BookMeta[]>
    remove(bookId: string): Promise<void>
    updateProgress(bookId: string, progress: ReadingProgress): Promise<void>
    getProgress(bookId: string): Promise<ReadingProgress | null>
    updateTitle(bookId: string, title: string): Promise<void>
  }
  reader: {
    open(bookId: string): Promise<ReaderOpenResult | null>
    getChapterContent(bookId: string, chapterIndex: number): Promise<ChapterContent | null>
    getContent(bookId: string): Promise<string | null>
    search(bookId: string, query: string): Promise<SearchResult[]>
  }
  bookmarks: {
    get(bookId: string): Promise<Bookmark[]>
    add(bookId: string, input: BookmarkInput): Promise<Bookmark>
    remove(bookId: string, bookmarkId: string): Promise<void>
  }
  backup: {
    export(): Promise<BackupOperationResult>
    restore(): Promise<BackupOperationResult>
  }
  settings: {
    get(): Promise<AppSettings>
    setFontSize(size: number): Promise<void>
    setFontFamily(font: string): Promise<void>
    setLineHeight(lineHeight: number): Promise<void>
    setDisguiseTheme(theme: DisguiseTheme): Promise<void>
    setStealthEnabled(enabled: boolean): Promise<void>
  }
  stealth: {
    setDisguise(theme: DisguiseTheme): Promise<void>
    hide(): Promise<void>
    mouseLeave(): Promise<void>
    mouseEnter(): Promise<void>
  }
  events: {
    onStealthHidden(callback: () => void): Unsubscribe
    onStealthShown(callback: () => void): Unsubscribe
    onShortcutRegistrationFailed(
      callback: (failure: ShortcutRegistrationFailure) => void
    ): Unsubscribe
    onAutosaveFailed(callback: (failure: AutoSaveFailure) => void): Unsubscribe
  }
}
