import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  Bookmark,
  Chapter,
  ChapterContent,
  ReadingProgress,
  SearchResult
} from '../../../shared/types'
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_STEP,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_LINE_HEIGHT,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP
} from '../../../shared/constants'
import './ReaderView.css'

/** 可选字体列表 */
const FONT_OPTIONS = [
  { value: 'Consolas, monospace', label: '等宽字体' },
  { value: 'Monaco, monospace', label: '苹果等宽' },
  { value: '"Courier New", monospace', label: '经典等宽' },
  { value: 'SimSun, serif', label: '宋体' },
  { value: '"Microsoft YaHei", sans-serif', label: '微软雅黑' },
  { value: '"Source Code Pro", monospace', label: '源码等宽' },
  { value: 'monospace', label: '系统等宽' }
]

/** 提前加载相邻章节，减少章节边界处的等待感。 */
const CHAPTER_ADVANCE_THRESHOLD = 160

export interface ReaderViewProps {
  /** 书籍文本内容 */
  content: string
  /** 当前章节正文元信息 */
  chapterContent?: ChapterContent
  /** 章节列表 */
  chapters: Chapter[]
  /** 当前阅读进度 */
  progress: ReadingProgress
  /** 进度变化回调 */
  onProgressChange: (progress: ReadingProgress) => void
  /** 返回书架回调 */
  onBack: () => void
  /** 切换章节回调 */
  onSelectChapter?: (index: number) => void | Promise<void>
  /** 按需加载相邻章节，用于上下连续阅读 */
  onLoadChapterContent?: (index: number) => Promise<ChapterContent | null>
  /** 连续阅读时通知外部当前进入的章节 */
  onChapterVisible?: (chapterContent: ChapterContent) => void
  /** 搜索结果 */
  searchResults?: SearchResult[]
  /** 搜索回调 */
  onSearch?: (query: string) => void | Promise<void>
  /** 选择搜索结果 */
  onSelectSearchResult?: (result: SearchResult) => void | Promise<void>
  /** 当前书籍书签 */
  bookmarks?: Bookmark[]
  /** 添加书签 */
  onAddBookmark?: () => void | Promise<void>
  /** 跳转到书签 */
  onSelectBookmark?: (bookmark: Bookmark) => void | Promise<void>
  /** 删除书签 */
  onRemoveBookmark?: (bookmarkId: string) => void | Promise<void>
  /** 章节内目标字符偏移量，用于搜索结果定位 */
  targetChapterOffset?: number | null
  /** 初始字号 */
  initialFontSize?: number
  /** 初始字体 */
  initialFontFamily?: string
  /** 初始行间距 */
  initialLineHeight?: number
  /** 目录是否显示 */
  chapterListVisible?: boolean
  /** 外部导航 key：打开书/点目录时变化，普通滚动不变化 */
  navigationKey?: number
  /** 切换目录显示状态 */
  onToggleChapterList?: () => void
}

/**
 * 阅读视图组件
 * 提供键盘翻页、鼠标滚轮滚动、字体调整和进度显示功能
 */
export function ReaderView({
  content,
  chapterContent,
  chapters,
  progress,
  onProgressChange,
  onBack,
  onSelectChapter,
  onLoadChapterContent,
  onChapterVisible,
  searchResults = [],
  onSearch,
  onSelectSearchResult,
  bookmarks = [],
  onAddBookmark,
  onSelectBookmark,
  onRemoveBookmark,
  targetChapterOffset = null,
  initialFontSize = DEFAULT_FONT_SIZE,
  initialFontFamily = DEFAULT_FONT_FAMILY,
  initialLineHeight = DEFAULT_LINE_HEIGHT,
  chapterListVisible = true,
  navigationKey = 0,
  onToggleChapterList = () => {}
}: ReaderViewProps): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null)
  const [fontSize, setFontSize] = useState<number>(initialFontSize)
  const [fontFamily, setFontFamily] = useState<string>(initialFontFamily)
  const [lineHeight, setLineHeight] = useState<number>(initialLineHeight)
  const [percentage, setPercentage] = useState<number>(progress.percentage)
  const [searchQuery, setSearchQuery] = useState('')
  const [loadedChapterContents, setLoadedChapterContents] = useState<ChapterContent[]>([])
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(
    chapterContent?.chapterIndex ?? progress.chapterIndex
  )
  const lastNavigationKey = useRef<number | null>(null)
  const loadedChapterMap = useRef<Map<number, ChapterContent>>(new Map())
  const loadingChapterIndexes = useRef<Set<number>>(new Set())
  const activeChapterIndexRef = useRef(activeChapterIndex)
  const loadGeneration = useRef(0)
  const pendingPrependAdjustment = useRef<{ scrollTop: number; scrollHeight: number } | null>(null)
  const pendingNavigationScroll = useRef<{
    navigationKey: number
    chapterIndex: number
    scrollPosition: number
    targetChapterOffset: number | null
  } | null>(null)
  const fallbackChapterAdvance = useRef<number | null>(null)
  const currentChapterIndex = activeChapterIndex

  useEffect(() => {
    setFontSize(initialFontSize)
  }, [initialFontSize])

  useEffect(() => {
    setFontFamily(initialFontFamily)
  }, [initialFontFamily])

  useEffect(() => {
    setLineHeight(initialLineHeight)
  }, [initialLineHeight])

  useEffect(() => {
    setPercentage(progress.percentage)
    if (lastNavigationKey.current === navigationKey) {
      if (!chapterContent) return

      const existing = loadedChapterMap.current.get(chapterContent.chapterIndex)
      if (existing === chapterContent) return

      loadedChapterMap.current.set(chapterContent.chapterIndex, chapterContent)
      setLoadedChapterContents((items) => {
        const next = items.filter((item) => item.chapterIndex !== chapterContent.chapterIndex)
        return [...next, chapterContent].sort((a, b) => a.chapterIndex - b.chapterIndex)
      })
      return
    }

    lastNavigationKey.current = navigationKey
    loadGeneration.current += 1
    loadingChapterIndexes.current.clear()
    fallbackChapterAdvance.current = null
    pendingPrependAdjustment.current = null
    activeChapterIndexRef.current = chapterContent?.chapterIndex ?? progress.chapterIndex
    setActiveChapterIndex(activeChapterIndexRef.current)

    if (chapterContent) {
      loadedChapterMap.current = new Map([[chapterContent.chapterIndex, chapterContent]])
      setLoadedChapterContents([chapterContent])
      pendingNavigationScroll.current = {
        navigationKey,
        chapterIndex: chapterContent.chapterIndex,
        scrollPosition: progress.scrollPosition,
        targetChapterOffset
      }
    } else {
      loadedChapterMap.current = new Map()
      setLoadedChapterContents([])
      pendingNavigationScroll.current = {
        navigationKey,
        chapterIndex: progress.chapterIndex,
        scrollPosition: progress.scrollPosition,
        targetChapterOffset: null
      }
    }
  }, [chapterContent, navigationKey, progress.chapterIndex, progress.percentage, progress.scrollPosition, targetChapterOffset])

  useLayoutEffect(() => {
    const el = contentRef.current
    const pending = pendingNavigationScroll.current
    if (!el || !pending || pending.navigationKey !== navigationKey) return

    if (loadedChapterContents.length > 0) {
      const block = el.querySelector<HTMLElement>(
        `[data-reader-chapter-index="${pending.chapterIndex}"]`
      )

      if (block) {
        if (pending.scrollPosition > 0) {
          el.scrollTop = block.offsetTop + pending.scrollPosition
        } else if (pending.targetChapterOffset !== null) {
          const maxScroll = Math.max(block.offsetHeight - el.clientHeight, 0)
          const chapter = loadedChapterContents.find(
            (item) => item.chapterIndex === pending.chapterIndex
          )
          const ratio = chapter && chapter.length > 0
            ? pending.targetChapterOffset / chapter.length
            : 0
          el.scrollTop = block.offsetTop + Math.max(0, Math.min(maxScroll, Math.round(maxScroll * ratio)))
        } else {
          el.scrollTop = block.offsetTop
        }
      }
    } else if (!chapterContent && progress.scrollPosition > 0) {
      el.scrollTop = progress.scrollPosition
    } else if (!chapterContent && progress.chapterIndex > 0 && chapters[progress.chapterIndex] && content.length > 0) {
      const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0)
      const ratio = chapters[progress.chapterIndex].offset / content.length
      el.scrollTop = Math.round(maxScroll * ratio)
    }

    pendingNavigationScroll.current = null
  }, [chapterContent, chapters, content.length, loadedChapterContents, navigationKey, progress.chapterIndex])

  useLayoutEffect(() => {
    const adjustment = pendingPrependAdjustment.current
    const el = contentRef.current
    if (!adjustment || !el) return

    const scrollHeightDelta = el.scrollHeight - adjustment.scrollHeight
    el.scrollTop = adjustment.scrollTop + Math.max(0, scrollHeightDelta)
    pendingPrependAdjustment.current = null
  }, [loadedChapterContents])

  const getChapterBlock = useCallback((chapterIndex: number): HTMLElement | null => {
    return contentRef.current?.querySelector<HTMLElement>(
      `[data-reader-chapter-index="${chapterIndex}"]`
    ) ?? null
  }, [])

  const findActiveChapter = useCallback((): number => {
    const el = contentRef.current
    const loaded = loadedChapterContents
    if (!el || loaded.length === 0) return activeChapterIndexRef.current

    const anchor = el.scrollTop + Math.max(el.clientHeight * 0.35, 1)
    for (const chapter of loaded) {
      const block = getChapterBlock(chapter.chapterIndex)
      if (!block) continue
      const blockEnd = block.offsetTop + Math.max(block.offsetHeight, 1)
      if (anchor < blockEnd) return chapter.chapterIndex
    }

    return loaded[loaded.length - 1].chapterIndex
  }, [getChapterBlock, loadedChapterContents])

  const getLocalScrollPosition = useCallback(
    (chapterIndex: number): number => {
      const el = contentRef.current
      const block = getChapterBlock(chapterIndex)
      if (!el || !block) return 0

      const maxLocalScroll = Math.max(block.offsetHeight - el.clientHeight, 0)
      if (maxLocalScroll <= 0) return 0
      return Math.max(0, Math.min(maxLocalScroll, el.scrollTop - block.offsetTop))
    },
    [getChapterBlock]
  )

  const notifyActiveChapter = useCallback(
    (chapterIndex: number): void => {
      if (activeChapterIndexRef.current === chapterIndex) return

      const visibleChapter = loadedChapterMap.current.get(chapterIndex)
      activeChapterIndexRef.current = chapterIndex
      setActiveChapterIndex(chapterIndex)
      if (visibleChapter) {
        onChapterVisible?.(visibleChapter)
      }
    },
    [onChapterVisible]
  )

  const loadAdjacentChapter = useCallback(
    (chapterIndex: number, direction: 'previous' | 'next'): void => {
      if (
        chapterIndex < 0 ||
        chapterIndex >= chapters.length ||
        loadedChapterMap.current.has(chapterIndex) ||
        loadingChapterIndexes.current.has(chapterIndex)
      ) {
        return
      }

      if (!onLoadChapterContent) {
        if (!onSelectChapter || fallbackChapterAdvance.current === chapterIndex) return
        fallbackChapterAdvance.current = chapterIndex
        try {
          const result = onSelectChapter(chapterIndex)
          void Promise.resolve(result).finally(() => {
            if (fallbackChapterAdvance.current === chapterIndex) {
              fallbackChapterAdvance.current = null
            }
          })
        } catch {
          fallbackChapterAdvance.current = null
        }
        return
      }

      const generation = loadGeneration.current
      const el = contentRef.current
      const scrollAnchor = direction === 'previous' && el
        ? { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight }
        : null
      loadingChapterIndexes.current.add(chapterIndex)

      void onLoadChapterContent(chapterIndex)
        .then((loadedChapter) => {
          if (
            !loadedChapter ||
            loadedChapter.chapterIndex !== chapterIndex ||
            generation !== loadGeneration.current
          ) {
            return
          }

          loadedChapterMap.current.set(chapterIndex, loadedChapter)
          if (scrollAnchor) {
            pendingPrependAdjustment.current = scrollAnchor
          }
          setLoadedChapterContents(
            Array.from(loadedChapterMap.current.values()).sort(
              (a, b) => a.chapterIndex - b.chapterIndex
            )
          )
        })
        .catch(() => undefined)
        .finally(() => {
          if (generation === loadGeneration.current) {
            loadingChapterIndexes.current.delete(chapterIndex)
          }
        })
    }, [chapters.length, onLoadChapterContent, onSelectChapter])

  const calculatePercentage = useCallback(
    (chapterIndex: number): number => {
      const activeContent = loadedChapterMap.current.get(chapterIndex) ??
        (chapterContent?.chapterIndex === chapterIndex ? chapterContent : null)
      const chapter = activeContent ?? chapters[chapterIndex]
      const totalLength = activeContent?.totalLength ?? chapterContent?.totalLength ?? content.length
      const chapterOffset = chapter?.offset ?? 0
      const chapterLength = activeContent?.length ?? chapter?.length ?? totalLength
      const maxLocalScroll = Math.max(
        (getChapterBlock(chapterIndex)?.offsetHeight ?? 0) - (contentRef.current?.clientHeight ?? 0),
        0
      )
      const localScroll = getLocalScrollPosition(chapterIndex)
      const localRatio = maxLocalScroll > 0 ? localScroll / maxLocalScroll : 0
      const absoluteOffset = chapterOffset + Math.round(localRatio * chapterLength)
      const pct = totalLength > 0 ? Math.round((absoluteOffset / totalLength) * 100) : 0
      return Math.max(0, Math.min(100, pct))
    },
    [chapterContent, chapters, content.length, getChapterBlock, getLocalScrollPosition]
  )

  const handleScroll = useCallback((): void => {
    const el = contentRef.current
    if (!el) return

    const chapterIndex = findActiveChapter()
    notifyActiveChapter(chapterIndex)
    const pct = calculatePercentage(chapterIndex)
    setPercentage(pct)

    onProgressChange({
      chapterIndex,
      scrollPosition: getLocalScrollPosition(chapterIndex),
      percentage: pct
    })

    const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0)
    const nearTop = el.scrollTop <= CHAPTER_ADVANCE_THRESHOLD
    const nearBottom = maxScroll > 0 && el.scrollTop >= maxScroll - CHAPTER_ADVANCE_THRESHOLD
    const firstLoaded = loadedChapterContents[0]?.chapterIndex
    const lastLoaded = loadedChapterContents[loadedChapterContents.length - 1]?.chapterIndex

    if (nearTop && firstLoaded !== undefined) {
      loadAdjacentChapter(firstLoaded - 1, 'previous')
    }
    if (nearBottom && lastLoaded !== undefined) {
      loadAdjacentChapter(lastLoaded + 1, 'next')
    }
  }, [
    calculatePercentage,
    findActiveChapter,
    getLocalScrollPosition,
    loadAdjacentChapter,
    loadedChapterContents,
    notifyActiveChapter,
    onProgressChange
  ])

  /** 没有可滚动距离的短章节，用滚轮手势触发相邻章节加载。 */
  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>): void => {
      const el = contentRef.current
      if (!el || loadedChapterContents.length === 0) return

      const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0)
      const firstLoaded = loadedChapterContents[0]?.chapterIndex
      const lastLoaded = loadedChapterContents[loadedChapterContents.length - 1]?.chapterIndex
      if (event.deltaY > 0 && (maxScroll <= 0 || el.scrollTop >= maxScroll - CHAPTER_ADVANCE_THRESHOLD)) {
        if (lastLoaded !== undefined) loadAdjacentChapter(lastLoaded + 1, 'next')
      } else if (event.deltaY < 0 && el.scrollTop <= CHAPTER_ADVANCE_THRESHOLD) {
        if (firstLoaded !== undefined) loadAdjacentChapter(firstLoaded - 1, 'previous')
      }
    },
    [loadAdjacentChapter, loadedChapterContents]
  )

  /**
   * Handle keyboard navigation
   * ArrowUp/ArrowDown: page up/down (scroll by viewport height)
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      const el = contentRef.current
      if (!el) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        el.scrollTop += el.clientHeight
        const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0)
        const lastLoaded = loadedChapterContents[loadedChapterContents.length - 1]?.chapterIndex
        if (
          lastLoaded !== undefined &&
          (maxScroll <= 0 || el.scrollTop >= maxScroll - CHAPTER_ADVANCE_THRESHOLD)
        ) {
          loadAdjacentChapter(lastLoaded + 1, 'next')
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        el.scrollTop -= el.clientHeight
        const firstLoaded = loadedChapterContents[0]?.chapterIndex
        if (firstLoaded !== undefined && el.scrollTop <= CHAPTER_ADVANCE_THRESHOLD) {
          loadAdjacentChapter(firstLoaded - 1, 'previous')
        }
      }
    },
    [loadAdjacentChapter, loadedChapterContents]
  )

  /**
   * Increase font size by step
   */
  const increaseFontSize = useCallback((): void => {
    setFontSize((prev) => {
      const next = Math.min(prev + FONT_SIZE_STEP, FONT_SIZE_MAX)
      void window.api.settings.setFontSize(next)
      return next
    })
  }, [])

  /**
   * Decrease font size by step
   */
  const decreaseFontSize = useCallback((): void => {
    setFontSize((prev) => {
      const next = Math.max(prev - FONT_SIZE_STEP, FONT_SIZE_MIN)
      void window.api.settings.setFontSize(next)
      return next
    })
  }, [])

  /**
   * Handle font family change
   */
  const handleFontFamilyChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>): void => {
      const newFont = e.target.value
      setFontFamily(newFont)
      void window.api.settings.setFontFamily(newFont)
    },
    []
  )

  const increaseLineHeight = useCallback((): void => {
    setLineHeight((prev) => {
      const next = Number(Math.min(prev + LINE_HEIGHT_STEP, LINE_HEIGHT_MAX).toFixed(1))
      void window.api.settings.setLineHeight(next)
      return next
    })
  }, [])

  const decreaseLineHeight = useCallback((): void => {
    setLineHeight((prev) => {
      const next = Number(Math.max(prev - LINE_HEIGHT_STEP, LINE_HEIGHT_MIN).toFixed(1))
      void window.api.settings.setLineHeight(next)
      return next
    })
  }, [])

  const goToPreviousChapter = useCallback((): void => {
    if (!onSelectChapter || currentChapterIndex <= 0) return
    void onSelectChapter(currentChapterIndex - 1)
  }, [currentChapterIndex, onSelectChapter])

  const goToNextChapter = useCallback((): void => {
    if (!onSelectChapter || currentChapterIndex >= chapters.length - 1) return
    void onSelectChapter(currentChapterIndex + 1)
  }, [chapters.length, currentChapterIndex, onSelectChapter])

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault()
      const query = searchQuery.trim()
      if (!query || !onSearch) return
      void onSearch(query)
    },
    [onSearch, searchQuery]
  )

  return (
    <div className="reader-view">
      {/* 阅读工具栏默认收起，避免阅读时误触返回或占用正文空间。 */}
      <details className="reader-toolbar-drawer">
        <summary
          className="reader-toolbar-drawer-trigger"
          aria-label="显示/隐藏阅读工具栏"
          title="显示/隐藏阅读工具栏"
        >
          ⋯
        </summary>
        <div className="reader-toolbar">
        <button className="reader-icon-btn reader-toolbar-back" onClick={onBack} aria-label="返回">
          ←
        </button>

        <button
          className={`reader-icon-btn ${chapterListVisible ? 'active' : ''}`}
          onClick={onToggleChapterList}
          aria-label={chapterListVisible ? '隐藏目录' : '显示目录'}
          title={chapterListVisible ? '隐藏目录' : '显示目录'}
        >
          ◧
        </button>

        <div className="reader-toolbar-separator" />

        {/* 阅读设置默认收起，避免阅读时占据顶部空间；点击 Aa 可展开。 */}
        <details className="reader-font-settings">
          <summary
            className="reader-icon-btn reader-font-settings-trigger"
            aria-label="阅读排版设置"
            title="显示/隐藏阅读设置"
          >
            Aa
          </summary>
          <div className="reader-font-settings-popover">
            <div className="reader-font-controls">
              <label>字号</label>
              <button
                className="reader-font-btn"
                onClick={decreaseFontSize}
                disabled={fontSize <= FONT_SIZE_MIN}
                aria-label="减小字号"
              >
                −
              </button>
              <span className="reader-font-size-display">{fontSize}px</span>
              <button
                className="reader-font-btn"
                onClick={increaseFontSize}
                disabled={fontSize >= FONT_SIZE_MAX}
                aria-label="增大字号"
              >
                +
              </button>
            </div>

            <div className="reader-toolbar-separator" />

            <div className="reader-font-controls">
              <label>字体</label>
              <select
                className="reader-font-family-select"
                value={fontFamily}
                onChange={handleFontFamilyChange}
                aria-label="选择字体"
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="reader-toolbar-separator" />

            <div className="reader-font-controls">
              <label>行距</label>
              <button
                className="reader-font-btn"
                onClick={decreaseLineHeight}
                disabled={lineHeight <= LINE_HEIGHT_MIN}
                aria-label="减小行距"
              >
                −
              </button>
              <span className="reader-font-size-display">{lineHeight.toFixed(1)}</span>
              <button
                className="reader-font-btn"
                onClick={increaseLineHeight}
                disabled={lineHeight >= LINE_HEIGHT_MAX}
                aria-label="增大行距"
              >
                +
              </button>
            </div>
          </div>
        </details>

        <div className="reader-toolbar-separator" />

        <button
          className="reader-chapter-nav-btn"
          onClick={goToPreviousChapter}
          disabled={!onSelectChapter || currentChapterIndex <= 0}
          aria-label="上一章"
        >
          上一章
        </button>
        <button
          className="reader-chapter-nav-btn"
          onClick={goToNextChapter}
          disabled={!onSelectChapter || currentChapterIndex >= chapters.length - 1}
          aria-label="下一章"
        >
          下一章
        </button>

        <div className="reader-toolbar-separator" />

        <form className="reader-search-form" onSubmit={handleSearchSubmit}>
          <input
            className="reader-search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索正文"
            aria-label="搜索正文"
          />
          <button
            className="reader-chapter-nav-btn"
            type="submit"
            disabled={!onSearch || searchQuery.trim().length === 0}
          >
            搜索
          </button>
        </form>

        <button
          className="reader-chapter-nav-btn"
          onClick={() => void onAddBookmark?.()}
          disabled={!onAddBookmark}
          aria-label="添加书签"
        >
          书签+
        </button>

        <details className="reader-bookmark-menu">
          <summary>书签 {bookmarks.length}</summary>
          <div className="reader-bookmark-list">
            {bookmarks.length === 0 ? (
              <div className="reader-bookmark-empty">暂无书签</div>
            ) : (
              bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="reader-bookmark-item">
                  <button
                    className="reader-bookmark-jump"
                    onClick={() => void onSelectBookmark?.(bookmark)}
                    title={bookmark.excerpt}
                  >
                    <span>{bookmark.title}</span>
                    <small>{bookmark.percentage}%</small>
                  </button>
                  <button
                    className="reader-bookmark-remove"
                    onClick={() => void onRemoveBookmark?.(bookmark.id)}
                    aria-label={`删除书签 ${bookmark.title}`}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </details>

        </div>
      </details>

      {searchResults.length > 0 && (
        <div className="reader-search-results" role="list" aria-label="搜索结果">
          {searchResults.map((result, index) => (
            <button
              key={`${result.chapterIndex}-${result.absoluteOffset}-${index}`}
              className="reader-search-result"
              onClick={() => void onSelectSearchResult?.(result)}
              role="listitem"
              title={result.snippet}
            >
              <span className="reader-search-result-title">{result.chapterTitle}</span>
              <span className="reader-search-result-snippet">{result.snippet}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div
        ref={contentRef}
        className="reader-content"
        tabIndex={0}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          lineHeight
        }}
        role="document"
        aria-label="阅读内容"
      >
        {loadedChapterContents.length > 0
          ? loadedChapterContents.map((chapter) => (
              <div
                key={chapter.chapterIndex}
                className="reader-chapter-block"
                data-reader-chapter-index={chapter.chapterIndex}
              >
                {chapter.content}
              </div>
            ))
          : content}
      </div>

      {/* Status bar with progress */}
      <div className="reader-status-bar">
        <div className="reader-status-meta">
          <span className="reader-chapter-progress">
            {chapters.length > 0 ? `${currentChapterIndex + 1}/${chapters.length}` : '0/0'}
          </span>
          <span className="reader-status-title" title={chapterContent?.title ?? '正文'}>
            阅读中 · {chapterContent?.title ?? '正文'}
          </span>
        </div>
        <div className="reader-status-progress">
          <div className="reader-progress-track" aria-hidden="true">
            <span style={{ transform: `scaleX(${percentage / 100})` }} />
          </div>
          <span className="reader-progress-text">阅读进度：{percentage}%</span>
        </div>
      </div>
    </div>
  )
}
