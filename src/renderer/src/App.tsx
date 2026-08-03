import { useState, useEffect, useCallback } from 'react'
import type {
  AppSettings,
  Bookmark,
  Chapter,
  ChapterContent,
  ReadingProgress,
  SearchResult,
  DisguiseTheme as DisguiseThemeType
} from '../../shared/types'
import BookshelfView from './components/BookshelfView'
import { ReaderView } from './components/ReaderView'
import { ChapterList } from './components/ChapterList'
import { DisguiseTheme, getThemeClassName } from './components/DisguiseTheme'
import Toast from './components/Toast'
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from '../../shared/constants'
import './App.css'

type AppView = 'bookshelf' | 'reader'

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
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE)
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT_FAMILY)
  const [lineHeight, setLineHeight] = useState<number>(DEFAULT_LINE_HEIGHT)
  const [chapterListVisible, setChapterListVisible] = useState<boolean>(true)
  const [readerNavigationKey, setReaderNavigationKey] = useState<number>(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [targetChapterOffset, setTargetChapterOffset] = useState<number | null>(null)

  /** Open a book: fetch content and progress, switch to reader view */
  const handleOpenBook = useCallback(async (bookId: string) => {
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
      setReaderNavigationKey((key) => key + 1)

      setView('reader')
    } catch {
      // Failed to open book, stay on bookshelf
    }
  }, [])

  /** Handle progress change in reader */
  const handleProgressChange = useCallback(
    (progress: ReadingProgress) => {
      setCurrentProgress(progress)
      if (currentBookId) {
        void window.api.bookshelf.updateProgress(currentBookId, progress)
      }
    },
    [currentBookId]
  )

  /** Handle back to bookshelf */
  const handleBack = useCallback(() => {
    setView('bookshelf')
    setCurrentBookId(null)
    setCurrentChapterContent(null)
    setCurrentChapters([])
    setCurrentProgress({ chapterIndex: 0, scrollPosition: 0, percentage: 0 })
    setSearchResults([])
    setBookmarks([])
    setTargetChapterOffset(null)
  }, [])

  /** Handle chapter selection */
  const handleSelectChapter = useCallback(
    async (index: number) => {
      if (!currentBookId || index < 0 || index >= currentChapters.length) return
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
        void window.api.bookshelf.updateProgress(currentBookId, newProgress)
      } catch {
        // Failed to load chapter, keep the current reading position.
      }
    },
    [currentChapters, currentBookId]
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
      setReaderNavigationKey((key) => key + 1)
      void window.api.bookshelf.updateProgress(currentBookId, nextProgress)
    },
    [currentBookId]
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
      void window.api.bookshelf.updateProgress(currentBookId, nextProgress)
    },
    [currentBookId]
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

  /** Load persisted application settings */
  useEffect(() => {
    let mounted = true

    window.api.settings.get().then((settings) => {
      if (!mounted || !settings) return
      const appSettings: AppSettings = settings
      setDisguiseTheme(appSettings.disguiseTheme)
      setStealthEnabled(appSettings.stealthEnabled)
      setFontSize(appSettings.fontSize)
      setFontFamily(appSettings.fontFamily)
      setLineHeight(appSettings.lineHeight)
      void window.api.stealth.setDisguise(appSettings.disguiseTheme)
    })

    return () => {
      mounted = false
    }
  }, [])

  /** Mouse tracking for stealth mode */
  const handleMouseLeave = useCallback(() => {
    if (stealthEnabled) {
      void window.api.stealth.mouseLeave()
    }
  }, [stealthEnabled])

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
      className={`app ${getThemeClassName(disguiseTheme)}`}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
    >
      <div className="app-drag-region" />
      <div className="app-topbar">
        <DisguiseTheme
          theme={disguiseTheme}
          stealthEnabled={stealthEnabled}
          onThemeChange={handleThemeChange}
          onStealthEnabledChange={handleStealthEnabledChange}
        />
      </div>

      {view === 'bookshelf' && <BookshelfView onOpenBook={handleOpenBook} />}

      {view === 'reader' && (
        <div className="reader-layout">
          {chapterListVisible && (
            <ChapterList
              chapters={currentChapters}
              currentChapterIndex={currentProgress.chapterIndex}
              onSelectChapter={handleSelectChapter}
            />
          )}
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
                onToggleChapterList={() => setChapterListVisible((visible) => !visible)}
              />
            )}
          </div>
        </div>
      )}

      <Toast />
    </div>
  )
}

export default App
