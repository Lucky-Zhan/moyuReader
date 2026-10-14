import { useState, useEffect, useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type {
  AppSettings,
  Bookmark,
  Chapter,
  ChapterContent,
  ReadingProgress,
  SearchResult,
  DisguiseTheme as DisguiseThemeType,
  MouseLeaveAction
} from '../../shared/types'
import BookshelfView from './components/BookshelfView'
import { ReaderView } from './components/ReaderView'
import ChapterDrawer from './components/ChapterDrawer'
import { DisguiseTheme, getThemeClassName } from './components/DisguiseTheme'
import Toast from './components/Toast'
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_MOUSE_LEAVE_ACTION,
  DEFAULT_MOUSE_LEAVE_QUIT_DELAY,
  DEFAULT_MOUSE_RETURN_DELAY
} from '../../shared/constants'
import './styles/tokens.css'
import './styles/tooltip.css'
import './App.css'

type AppView = 'bookshelf' | 'reader'

const WINDOW_DRAG_REGION_HEIGHT = 88

interface WindowDragState {
  pointerId: number | null
  lastScreenX: number
  lastScreenY: number
  pendingDeltaX: number
  pendingDeltaY: number
  frame: number | null
}

function getPointerScreenPosition(event: ReactPointerEvent<HTMLDivElement>): {
  x: number
  y: number
} {
  return {
    x: Number.isFinite(event.screenX) ? event.screenX : event.clientX,
    y: Number.isFinite(event.screenY) ? event.screenY : event.clientY
  }
}

function isWindowDragSurface(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  // The reader toolbar is a <details> container, but its blank chrome is
  // still a valid title surface. Only controls and explicitly interactive
  // popover content opt out of dragging; excluding the whole details node
  // makes the visible toolbar impossible to use as a grab handle.
  if (target.closest('button, input, select, summary, a, [data-no-window-drag]')) {
    return false
  }
  return Boolean(
    target.closest('.app-drag-region, .reader-toolbar-reveal-zone, .app-topbar, .reader-toolbar')
  )
}

function App(): JSX.Element {
  const [view, setView] = useState<AppView>('bookshelf')
  const [currentBookId, setCurrentBookId] = useState<string | null>(null)
  const [currentChapterContent, setCurrentChapterContent] = useState<ChapterContent | null>(null)
  const [currentChapters, setCurrentChapters] = useState<Chapter[]>([])
  const [currentProgress, setCurrentProgress] = useState<ReadingProgress>({
    chapterIndex: 0,
    scrollPosition: 0,
    percentage: 0
  })
  const [disguiseTheme, setDisguiseTheme] = useState<DisguiseThemeType>('dark')
  const [stealthEnabled, setStealthEnabled] = useState<boolean>(true)
  const [mouseLeaveAction, setMouseLeaveAction] = useState<MouseLeaveAction>(
    DEFAULT_MOUSE_LEAVE_ACTION
  )
  const [mouseLeaveDelay, setMouseLeaveDelay] = useState<number>(DEFAULT_MOUSE_LEAVE_QUIT_DELAY)
  const [mouseReturnDelay, setMouseReturnDelay] = useState<number>(DEFAULT_MOUSE_RETURN_DELAY)
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE)
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_FAMILY)
  const [lineHeight, setLineHeight] = useState<number>(DEFAULT_LINE_HEIGHT)
  const [chapterListVisible, setChapterListVisible] = useState<boolean>(false)
  const chapterDrawerTriggerRef = useRef<HTMLButtonElement>(null)
  const [readerNavigationKey, setReaderNavigationKey] = useState<number>(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [targetChapterOffset, setTargetChapterOffset] = useState<number | null>(null)
  const progressSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingProgressRef = useRef<{ bookId: string; progress: ReadingProgress } | null>(null)
  const isWindowDraggingRef = useRef(false)
  const windowDragRef = useRef<WindowDragState>({
    pointerId: null,
    lastScreenX: 0,
    lastScreenY: 0,
    pendingDeltaX: 0,
    pendingDeltaY: 0,
    frame: null
  })

  /** 立即写入当前待保存进度，并取消已有 debounce。 */
  const flushPendingProgress = useCallback((): void => {
    if (progressSaveTimerRef.current !== null) {
      clearTimeout(progressSaveTimerRef.current)
      progressSaveTimerRef.current = null
    }

    const pending = pendingProgressRef.current
    pendingProgressRef.current = null
    if (!pending) return

    void window.api.bookshelf.updateProgress(pending.bookId, pending.progress)
  }, [])

  /** 滚动期间只保留最新进度，停止约 250ms 后再通过 IPC 持久化。 */
  const scheduleProgressSave = useCallback(
    (bookId: string, progress: ReadingProgress): void => {
      pendingProgressRef.current = { bookId, progress }
      if (progressSaveTimerRef.current !== null) {
        clearTimeout(progressSaveTimerRef.current)
      }
      progressSaveTimerRef.current = setTimeout(() => {
        progressSaveTimerRef.current = null
        flushPendingProgress()
      }, 250)
    },
    [flushPendingProgress]
  )

  /** 换章、跳转等离开当前阅读位置的动作必须立即保存。 */
  const persistProgressImmediately = useCallback(
    (bookId: string, progress: ReadingProgress): void => {
      flushPendingProgress()
      pendingProgressRef.current = { bookId, progress }
      flushPendingProgress()
    },
    [flushPendingProgress]
  )

  const flushWindowDrag = useCallback((): void => {
    const drag = windowDragRef.current
    drag.frame = null
    const deltaX = Math.round(drag.pendingDeltaX)
    const deltaY = Math.round(drag.pendingDeltaY)
    drag.pendingDeltaX = 0
    drag.pendingDeltaY = 0
    if (deltaX === 0 && deltaY === 0) return

    void Promise.resolve(window.api.window.drag.moveBy(deltaX, deltaY)).catch(() => undefined)
  }, [])

  const scheduleWindowDragFlush = useCallback((): void => {
    const drag = windowDragRef.current
    if (typeof window.requestAnimationFrame !== 'function') {
      flushWindowDrag()
      return
    }
    if (drag.frame !== null) return
    drag.frame = window.requestAnimationFrame(() => {
      flushWindowDrag()
    })
  }, [flushWindowDrag])

  const handleWindowDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (
        isWindowDraggingRef.current ||
        event.button !== 0 ||
        (event.isPrimary === false && event.pointerType === 'touch') ||
        event.clientY > WINDOW_DRAG_REGION_HEIGHT ||
        !isWindowDragSurface(event.target)
      ) {
        return
      }

      const position = getPointerScreenPosition(event)
      const drag = windowDragRef.current
      drag.pointerId = event.pointerId
      drag.lastScreenX = position.x
      drag.lastScreenY = position.y
      drag.pendingDeltaX = 0
      drag.pendingDeltaY = 0
      isWindowDraggingRef.current = true
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      void Promise.resolve(window.api.window.drag.start()).catch(() => {
        const currentDrag = windowDragRef.current
        if (currentDrag.pointerId !== event.pointerId) return
        if (currentDrag.frame !== null && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(currentDrag.frame)
        }
        currentDrag.frame = null
        currentDrag.pendingDeltaX = 0
        currentDrag.pendingDeltaY = 0
        isWindowDraggingRef.current = false
        currentDrag.pointerId = null
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      })
    },
    []
  )

  const handleWindowDragPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const drag = windowDragRef.current
      if (!isWindowDraggingRef.current || drag.pointerId !== event.pointerId) return

      const position = getPointerScreenPosition(event)
      drag.pendingDeltaX += position.x - drag.lastScreenX
      drag.pendingDeltaY += position.y - drag.lastScreenY
      drag.lastScreenX = position.x
      drag.lastScreenY = position.y
      event.preventDefault()
      scheduleWindowDragFlush()
    },
    [scheduleWindowDragFlush]
  )

  const handleWindowDragPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const drag = windowDragRef.current
      if (!isWindowDraggingRef.current || drag.pointerId !== event.pointerId) return

      if (drag.frame !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(drag.frame)
        drag.frame = null
      }
      flushWindowDrag()
      isWindowDraggingRef.current = false
      drag.pointerId = null
      void Promise.resolve(window.api.window.drag.end()).catch(() => undefined)
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    },
    [flushWindowDrag]
  )

  useEffect(() => {
    return () => {
      const frame = windowDragRef.current.frame
      if (frame !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frame)
      }
      windowDragRef.current.frame = null
      if (isWindowDraggingRef.current) {
        void Promise.resolve(window.api.window.drag.end()).catch(() => undefined)
      }
      isWindowDraggingRef.current = false
    }
  }, [])

  /** Open a book: fetch content and progress, switch to reader view */
  const handleOpenBook = useCallback(async (bookId: string) => {
    flushPendingProgress()
    try {
      const result = await window.api.reader.open(bookId)
      if (!result) return

      setCurrentBookId(bookId)
      setCurrentChapterContent(result.chapterContent)
      setCurrentChapters(result.book.chapters)
      setCurrentProgress(result.progress)
      setBookmarks(await window.api.bookmarks.get(bookId))
      setSearchResults([])
      setTargetChapterOffset(null)
      setChapterListVisible(false)
      setReaderNavigationKey((key) => key + 1)

      setView('reader')
    } catch {
      // Failed to open book, stay on bookshelf
    }
  }, [flushPendingProgress])

  /** Handle progress change in reader */
  const handleProgressChange = useCallback(
    (progress: ReadingProgress) => {
      setCurrentProgress(progress)
      if (currentBookId) {
        scheduleProgressSave(currentBookId, progress)
      }
    },
    [currentBookId, scheduleProgressSave]
  )

  /** Handle back to bookshelf */
  const handleBack = useCallback(() => {
    flushPendingProgress()
    setView('bookshelf')
    setCurrentBookId(null)
    setCurrentChapterContent(null)
    setCurrentChapters([])
    setCurrentProgress({ chapterIndex: 0, scrollPosition: 0, percentage: 0 })
    setSearchResults([])
    setBookmarks([])
    setTargetChapterOffset(null)
    setChapterListVisible(false)
  }, [flushPendingProgress])

  /** Handle chapter selection */
  const handleSelectChapter = useCallback(
    async (index: number) => {
      if (!currentBookId || index < 0 || index >= currentChapters.length) return
      flushPendingProgress()
      try {
        const chapterContent = await window.api.reader.getChapterContent(currentBookId, index)
        if (!chapterContent) return

        const percentage =
          chapterContent.totalLength > 0
            ? Math.round((chapterContent.offset / chapterContent.totalLength) * 100)
            : 0
        const newProgress: ReadingProgress = {
          chapterIndex: index,
          scrollPosition: 0,
          percentage: Math.max(0, Math.min(100, percentage))
        }
        setCurrentChapterContent(chapterContent)
        setCurrentProgress(newProgress)
        setTargetChapterOffset(null)
        setReaderNavigationKey((key) => key + 1)
        persistProgressImmediately(currentBookId, newProgress)
      } catch {
        // Failed to load chapter, keep the current reading position.
      }
    },
    [currentChapters, currentBookId, flushPendingProgress, persistProgressImmediately]
  )

  const handleLoadChapterContent = useCallback(
    (chapterIndex: number): Promise<ChapterContent | null> => {
      if (!currentBookId) return Promise.resolve(null)
      return window.api.reader.getChapterContent(currentBookId, chapterIndex)
    },
    [currentBookId]
  )

  const handleChapterVisible = useCallback((chapterContent: ChapterContent): void => {
    setCurrentChapterContent((current) => {
      if (current?.chapterIndex === chapterContent.chapterIndex) return current
      return chapterContent
    })
  }, [])

  const handleSearch = useCallback(
    async (query: string) => {
      if (!currentBookId) return
      const results = await window.api.reader.search(currentBookId, query)
      setSearchResults(results)
    },
    [currentBookId]
  )

  const handleSelectSearchResult = useCallback(
    async (result: SearchResult) => {
      if (!currentBookId) return
      flushPendingProgress()
      const chapterContent = await window.api.reader.getChapterContent(
        currentBookId,
        result.chapterIndex
      )
      if (!chapterContent) return

      const percentage =
        chapterContent.totalLength > 0
          ? Math.round((result.absoluteOffset / chapterContent.totalLength) * 100)
          : 0
      const nextProgress: ReadingProgress = {
        chapterIndex: result.chapterIndex,
        scrollPosition: 0,
        percentage: Math.max(0, Math.min(100, percentage))
      }

      setCurrentChapterContent(chapterContent)
      setCurrentProgress(nextProgress)
      setTargetChapterOffset(result.chapterOffset)
      setSearchResults([])
      setReaderNavigationKey((key) => key + 1)
      persistProgressImmediately(currentBookId, nextProgress)
    },
    [currentBookId, flushPendingProgress, persistProgressImmediately]
  )

  const handleAddBookmark = useCallback(async () => {
    if (!currentBookId || !currentChapterContent) return

    const bookmark = await window.api.bookmarks.add(currentBookId, {
      chapterIndex: currentProgress.chapterIndex,
      scrollPosition: currentProgress.scrollPosition,
      percentage: currentProgress.percentage,
      title: currentChapterContent.title,
      excerpt: currentChapterContent.content.slice(0, 80)
    })

    setBookmarks((items) => [bookmark, ...items.filter((item) => item.id !== bookmark.id)])
  }, [currentBookId, currentChapterContent, currentProgress])

  const handleSelectBookmark = useCallback(
    async (bookmark: Bookmark) => {
      if (!currentBookId) return
      flushPendingProgress()
      const chapterContent = await window.api.reader.getChapterContent(
        currentBookId,
        bookmark.chapterIndex
      )
      if (!chapterContent) return

      const nextProgress: ReadingProgress = {
        chapterIndex: bookmark.chapterIndex,
        scrollPosition: bookmark.scrollPosition,
        percentage: bookmark.percentage
      }

      setCurrentChapterContent(chapterContent)
      setCurrentProgress(nextProgress)
      setTargetChapterOffset(null)
      setReaderNavigationKey((key) => key + 1)
      persistProgressImmediately(currentBookId, nextProgress)
    },
    [currentBookId, flushPendingProgress, persistProgressImmediately]
  )

  const handleRemoveBookmark = useCallback(
    async (bookmarkId: string) => {
      if (!currentBookId) return
      await window.api.bookmarks.remove(currentBookId, bookmarkId)
      setBookmarks((items) => items.filter((item) => item.id !== bookmarkId))
    },
    [currentBookId]
  )

  /** Handle disguise theme change */
  const handleThemeChange = useCallback((theme: DisguiseThemeType) => {
    setDisguiseTheme(theme)
    void window.api.settings.setDisguiseTheme(theme)
    void window.api.stealth.setDisguise(theme)
  }, [])

  const handleStealthEnabledChange = useCallback((enabled: boolean) => {
    setStealthEnabled(enabled)
    void window.api.settings.setStealthEnabled(enabled)
  }, [])

  const handleMouseLeaveActionChange = useCallback((action: MouseLeaveAction) => {
    setMouseLeaveAction(action)
    void window.api.settings.setMouseLeaveAction(action)
  }, [])

  const handleMouseLeaveDelayChange = useCallback((delay: number) => {
    setMouseLeaveDelay(delay)
    void window.api.settings.setMouseLeaveDelay(delay)
  }, [])

  const handleMouseReturnDelayChange = useCallback((delay: number) => {
    setMouseReturnDelay(delay)
    void window.api.settings.setMouseReturnDelay(delay)
  }, [])

  /** Load persisted application settings */
  useEffect(() => {
    let mounted = true

    window.api.settings.get().then((settings) => {
      if (!mounted || !settings) return
      const appSettings: AppSettings = settings
      setDisguiseTheme(appSettings.disguiseTheme)
      setStealthEnabled(appSettings.stealthEnabled)
      setMouseLeaveAction(appSettings.mouseLeaveAction)
      setMouseLeaveDelay(appSettings.mouseLeaveDelay)
      setMouseReturnDelay(appSettings.mouseReturnDelay ?? DEFAULT_MOUSE_RETURN_DELAY)
      setFontSize(appSettings.fontSize)
      setFontFamily(appSettings.fontFamily)
      setLineHeight(appSettings.lineHeight)
      void window.api.stealth.setDisguise(appSettings.disguiseTheme)
    })

    return () => {
      mounted = false
    }
  }, [])

  const disguiseThemeControl = (
    <DisguiseTheme
      theme={disguiseTheme}
      stealthEnabled={stealthEnabled}
      mouseLeaveAction={mouseLeaveAction}
      mouseLeaveDelay={mouseLeaveDelay}
      mouseReturnDelay={mouseReturnDelay}
      onThemeChange={handleThemeChange}
      onStealthEnabledChange={handleStealthEnabledChange}
      onMouseLeaveActionChange={handleMouseLeaveActionChange}
      onMouseLeaveDelayChange={handleMouseLeaveDelayChange}
      onMouseReturnDelayChange={handleMouseReturnDelayChange}
    />
  )

  /** Mouse tracking for stealth mode */
  const handleMouseLeave = useCallback(() => {
    if (isWindowDraggingRef.current) return
    flushPendingProgress()
    if (stealthEnabled) {
      void window.api.stealth.mouseLeave()
    }
  }, [flushPendingProgress, stealthEnabled])

  const handleMouseEnter = useCallback(() => {
    if (stealthEnabled) {
      void window.api.stealth.mouseEnter()
    }
  }, [stealthEnabled])

  /** 某些 macOS 原生区域不会触发 renderer 的 mouseleave，窗口焦点事件作为兜底。 */
  useEffect(() => {
    window.addEventListener('blur', handleMouseLeave)
    window.addEventListener('focus', handleMouseEnter)

    return () => {
      window.removeEventListener('blur', handleMouseLeave)
      window.removeEventListener('focus', handleMouseEnter)
    }
  }, [handleMouseEnter, handleMouseLeave])

  useEffect(() => {
    return () => {
      flushPendingProgress()
    }
  }, [flushPendingProgress])

  /** Listen for stealth events from main process */
  useEffect(() => {
    const handleHidden = (): void => {
      // Window is being hidden - could update UI state if needed
    }
    const handleShown = (): void => {
      // Window is being shown - could update UI state if needed
    }

    const unsubscribeHidden = window.api.events.onStealthHidden(handleHidden)
    const unsubscribeShown = window.api.events.onStealthShown(handleShown)

    return () => {
      unsubscribeHidden()
      unsubscribeShown()
    }
  }, [])

  return (
    <div
      className={`app ${getThemeClassName(disguiseTheme)} ${view === 'reader' ? 'app-reading' : 'app-library'}`}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onPointerDown={handleWindowDragPointerDown}
      onPointerMove={handleWindowDragPointerMove}
      onPointerUp={handleWindowDragPointerEnd}
      onPointerCancel={handleWindowDragPointerEnd}
    >
      <div className="app-drag-region" />
      {view === 'bookshelf' && <div className="app-topbar">{disguiseThemeControl}</div>}

      {view === 'bookshelf' && <BookshelfView onOpenBook={handleOpenBook} />}

      {view === 'reader' && (
        <div className="reader-layout">
          <div className="reader-main">
            {currentChapterContent && (
              <ReaderView
                content={currentChapterContent.content}
                chapterContent={currentChapterContent}
                chapters={currentChapters}
                progress={currentProgress}
                onProgressChange={handleProgressChange}
                onBack={handleBack}
                onSelectChapter={handleSelectChapter}
                onLoadChapterContent={handleLoadChapterContent}
                onChapterVisible={handleChapterVisible}
                searchResults={searchResults}
                onSearch={handleSearch}
                onSelectSearchResult={handleSelectSearchResult}
                bookmarks={bookmarks}
                onAddBookmark={handleAddBookmark}
                onSelectBookmark={handleSelectBookmark}
                onRemoveBookmark={handleRemoveBookmark}
                targetChapterOffset={targetChapterOffset}
                initialFontSize={fontSize}
                initialFontFamily={fontFamily}
                initialLineHeight={lineHeight}
                chapterListVisible={chapterListVisible}
                navigationKey={readerNavigationKey}
                chapterListTriggerRef={chapterDrawerTriggerRef}
                onToggleChapterList={() => setChapterListVisible((visible) => !visible)}
                settingsSlot={disguiseThemeControl}
              />
            )}
          </div>
          <ChapterDrawer
            open={chapterListVisible}
            chapters={currentChapters}
            currentChapterIndex={currentProgress.chapterIndex}
            onSelectChapter={handleSelectChapter}
            onClose={() => setChapterListVisible(false)}
            triggerRef={chapterDrawerTriggerRef}
          />
        </div>
      )}

      <Toast />
    </div>
  )
}

export default App
