import { useState, useEffect, useCallback } from 'react'
import type {
  AppSettings,
  Chapter,
  ReadingProgress,
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
  const [currentContent, setCurrentContent] = useState<string>('')
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

  /** Open a book: fetch content and progress, switch to reader view */
  const handleOpenBook = useCallback(async (bookId: string) => {
    try {
      // Get book content
      const content = (await window.api.invoke('reader:getContent', bookId)) as string | null
      if (content === null) return

      // Get all books to find chapters for this book
      const books = (await window.api.invoke('bookshelf:getAll')) as Array<{
        id: string
        chapters: Chapter[]
      }>
      const book = books.find((b) => b.id === bookId)
      const chapters = book?.chapters ?? []

      const savedProgress = (await window.api.invoke(
        'bookshelf:getProgress',
        bookId
      )) as ReadingProgress | null

      setCurrentBookId(bookId)
      setCurrentContent(content)
      setCurrentChapters(chapters)
      setCurrentProgress(savedProgress ?? {
        chapterIndex: 0,
        scrollPosition: 0,
        percentage: 0
      })
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
        window.api.invoke('bookshelf:updateProgress', currentBookId, progress)
      }
    },
    [currentBookId]
  )

  /** Handle back to bookshelf */
  const handleBack = useCallback(() => {
    setView('bookshelf')
    setCurrentBookId(null)
    setCurrentContent('')
    setCurrentChapters([])
    setCurrentProgress({ chapterIndex: 0, scrollPosition: 0, percentage: 0 })
  }, [])

  /** Handle chapter selection */
  const handleSelectChapter = useCallback(
    (index: number) => {
      if (index < 0 || index >= currentChapters.length) return
      const chapter = currentChapters[index]
      // Update progress to the selected chapter
      const percentage =
        currentContent.length > 0
          ? Math.round((chapter.offset / currentContent.length) * 100)
          : 0
      const newProgress: ReadingProgress = {
        chapterIndex: index,
        scrollPosition: 0,
        percentage: Math.max(0, Math.min(100, percentage))
      }
      setCurrentProgress(newProgress)
      setReaderNavigationKey((key) => key + 1)
      if (currentBookId) {
        window.api.invoke('bookshelf:updateProgress', currentBookId, newProgress)
      }
    },
    [currentChapters, currentContent, currentBookId]
  )

  /** Handle disguise theme change */
  const handleThemeChange = useCallback((theme: DisguiseThemeType) => {
    setDisguiseTheme(theme)
    window.api.invoke('settings:setDisguiseTheme', theme)
    window.api.invoke('stealth:setDisguise', theme)
  }, [])

  const handleStealthEnabledChange = useCallback((enabled: boolean) => {
    setStealthEnabled(enabled)
    window.api.invoke('settings:setStealthEnabled', enabled)
  }, [])

  /** Load persisted application settings */
  useEffect(() => {
    let mounted = true

    window.api.invoke('settings:get').then((settings) => {
      if (!mounted || !settings) return
      const appSettings = settings as AppSettings
      setDisguiseTheme(appSettings.disguiseTheme)
      setStealthEnabled(appSettings.stealthEnabled)
      setFontSize(appSettings.fontSize)
      setFontFamily(appSettings.fontFamily)
      setLineHeight(appSettings.lineHeight)
      window.api.invoke('stealth:setDisguise', appSettings.disguiseTheme)
    })

    return () => {
      mounted = false
    }
  }, [])

  /** Mouse tracking for stealth mode */
  const handleMouseLeave = useCallback(() => {
    if (stealthEnabled) {
      window.api.invoke('stealth:mouseLeave')
    }
  }, [stealthEnabled])

  const handleMouseEnter = useCallback(() => {
    if (stealthEnabled) {
      window.api.invoke('stealth:mouseEnter')
    }
  }, [stealthEnabled])

  /** Listen for stealth events from main process */
  useEffect(() => {
    const handleHidden = (): void => {
      // Window is being hidden - could update UI state if needed
    }
    const handleShown = (): void => {
      // Window is being shown - could update UI state if needed
    }

    window.api.on('stealth:hidden', handleHidden)
    window.api.on('stealth:shown', handleShown)

    return () => {
      window.api.removeAllListeners('stealth:hidden')
      window.api.removeAllListeners('stealth:shown')
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
            <ReaderView
              content={currentContent}
              chapters={currentChapters}
              progress={currentProgress}
              onProgressChange={handleProgressChange}
              onBack={handleBack}
              initialFontSize={fontSize}
              initialFontFamily={fontFamily}
              initialLineHeight={lineHeight}
              chapterListVisible={chapterListVisible}
              navigationKey={readerNavigationKey}
              onToggleChapterList={() => setChapterListVisible((visible) => !visible)}
            />
          </div>
        </div>
      )}

      <Toast />
    </div>
  )
}

export default App
