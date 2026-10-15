import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  Bookmark,
  Chapter,
  ChapterContent,
  ReadingProgress,
  SearchResult
} from '@shared/types'
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_LINE_HEIGHT,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX
} from '@shared/constants'
import ReaderToolbar from './ReaderToolbar'
import ReaderSurface from './ReaderSurface'
import ReaderStatusBar from './ReaderStatusBar'
import './ReaderView.css'

/** 提前加载相邻章节，减少章节边界处的等待感。 */
const CHAPTER_ADVANCE_THRESHOLD = 160

/** 顶部工具栏的隐形唤醒区高度，覆盖 macOS hiddenInset 标题栏和少量缓冲。 */
const TOOLBAR_REVEAL_ZONE = 88
const TOOLBAR_HIDE_DELAY = 150

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
  /** 目录按钮引用，用于抽屉关闭后的焦点回收 */
  chapterListTriggerRef?: RefObject<HTMLButtonElement>
  /** 外部导航 key：打开书/点目录时变化，普通滚动不变化 */
  navigationKey?: number
  /** 切换目录显示状态 */
  onToggleChapterList?: () => void
  /** 阅读设置入口；与阅读工具栏一起自动显现/收起 */
  settingsSlot?: ReactNode
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
  chapterListVisible = false,
  chapterListTriggerRef,
  navigationKey = 0,
  onToggleChapterList = () => {},
  settingsSlot
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
  const scrollFrameRef = useRef<number | null>(null)
  const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const currentChapterIndex = activeChapterIndex

  /**
   * 把随渲染变化的回调放进 ref。
   *
   * processScroll 依赖 onProgressChange，而父组件每次 setState 都会给出新的
   * 函数引用；直接写进依赖数组会让整条滚动回调链在每一帧重建。滚动是最高频
   * 的路径，这里用 ref 读取最新实现，依赖数组里只保留稳定引用。
   */
  const onProgressChangeRef = useRef(onProgressChange)
  const onChapterVisibleRef = useRef(onChapterVisible)
  const onLoadChapterContentRef = useRef(onLoadChapterContent)
  const onSelectChapterRef = useRef(onSelectChapter)

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange
    onChapterVisibleRef.current = onChapterVisible
    onLoadChapterContentRef.current = onLoadChapterContent
    onSelectChapterRef.current = onSelectChapter
  })

  useEffect(() => {
    return () => {
      const frame = scrollFrameRef.current
      scrollFrameRef.current = null
      if (frame !== null && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      if (toolbarHideTimerRef.current !== null) {
        clearTimeout(toolbarHideTimerRef.current)
        toolbarHideTimerRef.current = null
      }
    }
  }, [])

  const revealToolbar = useCallback((): void => {
    if (toolbarHideTimerRef.current !== null) {
      clearTimeout(toolbarHideTimerRef.current)
      toolbarHideTimerRef.current = null
    }
    setToolbarOpen(true)
  }, [])

  const hideToolbar = useCallback((): void => {
    if (toolbarHideTimerRef.current !== null) return
    toolbarHideTimerRef.current = setTimeout(() => {
      toolbarHideTimerRef.current = null
      setToolbarOpen(false)
    }, TOOLBAR_HIDE_DELAY)
  }, [])

  const collapseToolbarImmediately = useCallback((): void => {
    if (toolbarHideTimerRef.current !== null) {
      clearTimeout(toolbarHideTimerRef.current)
      toolbarHideTimerRef.current = null
    }
    setToolbarOpen(false)
  }, [])

  useEffect(() => {
    if (chapterListVisible) collapseToolbarImmediately()
  }, [chapterListVisible, collapseToolbarImmediately])

  const handleToolbarPointerMove = useCallback(
    (clientY: number, target?: EventTarget | null): void => {
      if (
        target &&
        target instanceof Node &&
        (target as Element).closest?.(
          '.reader-toolbar-drawer, .reader-toolbar-settings, .reader-popover-panel, .reader-search-results'
        )
      ) {
        revealToolbar()
        return
      }

      if (clientY <= TOOLBAR_REVEAL_ZONE) {
        revealToolbar()
      } else if (toolbarOpen) {
        hideToolbar()
      }
    },
    [hideToolbar, revealToolbar, toolbarOpen]
  )

  const handleReaderMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      handleToolbarPointerMove(event.clientY, event.target)
    },
    [handleToolbarPointerMove]
  )

  /** Native title-bar regions do not always bubble mouse events to React. */
  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent): void => {
      handleToolbarPointerMove(event.clientY, event.target)
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    return () => window.removeEventListener('mousemove', handleWindowMouseMove)
  }, [handleToolbarPointerMove])

  useEffect(() => {
    setFontSize(initialFontSize)
  }, [initialFontSize])

  useEffect(() => {
    setFontFamily(initialFontFamily)
  }, [initialFontFamily])

  useEffect(() => {
    setLineHeight(initialLineHeight)
  }, [initialLineHeight])

  /** 进度百分比只用于状态栏展示，与导航无关，单独同步。 */
  useEffect(() => {
    setPercentage(progress.percentage)
  }, [progress.percentage])

  /**
   * 导航：仅在「打开书籍 / 点目录 / 点搜索结果」这类显式跳转时重置阅读状态。
   *
   * 之前把 progress.chapterIndex / percentage / scrollPosition 也写进依赖数组，
   * 于是滚动上报的进度会反复触发这段重置逻辑；而 progress 对象整体换引用时
   * 反而不触发，语义非常脆。这里改为只认 navigationKey，其余数据按需读取。
   */
  useEffect(() => {
    if (lastNavigationKey.current === navigationKey) return

    const frame = scrollFrameRef.current
    scrollFrameRef.current = null
    if (frame !== null && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(frame)
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
    // 只在导航 key 变化时重置；progress / chapterContent 是本次跳转的载荷，
    // 由同一个 navigationKey 一起更新，不需要单独作为触发条件。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationKey])

  /**
   * 同一导航会话内，父组件异步补齐了当前章节正文时同步进已加载列表。
   * 与上面的重置逻辑分开，避免「滚动上报进度」误触发重置。
   */
  useEffect(() => {
    if (lastNavigationKey.current !== navigationKey) return
    if (!chapterContent) return

    const existing = loadedChapterMap.current.get(chapterContent.chapterIndex)
    if (existing === chapterContent) return

    loadedChapterMap.current.set(chapterContent.chapterIndex, chapterContent)
    setLoadedChapterContents((items) => {
      const next = items.filter((item) => item.chapterIndex !== chapterContent.chapterIndex)
      return [...next, chapterContent].sort((a, b) => a.chapterIndex - b.chapterIndex)
    })
  }, [chapterContent, navigationKey])

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
        onChapterVisibleRef.current?.(visibleChapter)
      }
    },
    []
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

      if (!onLoadChapterContentRef.current) {
        const selectChapter = onSelectChapterRef.current
        if (!selectChapter || fallbackChapterAdvance.current === chapterIndex) return
        fallbackChapterAdvance.current = chapterIndex
        try {
          const result = selectChapter(chapterIndex)
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

      void onLoadChapterContentRef.current(chapterIndex)
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
    }, [chapters.length])

  /**
   * 当前视口顶端在「本章正文」中的字符偏移。
   *
   * 书签摘要需要知道用户到底停在哪里，否则同一章内所有书签的摘要都会是
   * 章节开头那几十个字（历史 bug）。这里复用与进度计算相同的换算：
   * 滚动比例 × 本章字符数。
   */
  const getChapterCharOffset = useCallback(
    (chapterIndex: number): number => {
      const activeContent = loadedChapterMap.current.get(chapterIndex) ??
        (chapterContent?.chapterIndex === chapterIndex ? chapterContent : null)
      const chapter = activeContent ?? chapters[chapterIndex]
      const chapterLength = activeContent?.length ?? chapter?.length ?? content.length
      const maxLocalScroll = Math.max(
        (getChapterBlock(chapterIndex)?.offsetHeight ?? 0) - (contentRef.current?.clientHeight ?? 0),
        0
      )
      const localScroll = getLocalScrollPosition(chapterIndex)
      const localRatio = maxLocalScroll > 0 ? localScroll / maxLocalScroll : 0
      return Math.max(0, Math.min(chapterLength, Math.round(localRatio * chapterLength)))
    },
    [chapterContent, chapters, content.length, getChapterBlock, getLocalScrollPosition]
  )

  const calculatePercentage = useCallback(
    (chapterIndex: number): number => {
      const activeContent = loadedChapterMap.current.get(chapterIndex) ??
        (chapterContent?.chapterIndex === chapterIndex ? chapterContent : null)
      const chapter = activeContent ?? chapters[chapterIndex]
      const totalLength = activeContent?.totalLength ?? chapterContent?.totalLength ?? content.length
      const chapterOffset = chapter?.offset ?? 0
      const absoluteOffset = chapterOffset + getChapterCharOffset(chapterIndex)
      const pct = totalLength > 0 ? Math.round((absoluteOffset / totalLength) * 100) : 0
      return Math.max(0, Math.min(100, pct))
    },
    [chapterContent, chapters, content.length, getChapterCharOffset]
  )

  const processScroll = useCallback((): void => {
    const el = contentRef.current
    if (!el) return

    const chapterIndex = findActiveChapter()
    notifyActiveChapter(chapterIndex)
    const pct = calculatePercentage(chapterIndex)
    setPercentage(pct)

    onProgressChangeRef.current({
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
    notifyActiveChapter
  ])

  /** 将高频 scroll 事件合并到浏览器绘制帧，保留原生滚动惯性。 */
  const handleScroll = useCallback((): void => {
    if (typeof window.requestAnimationFrame !== 'function') {
      processScroll()
      return
    }

    if (scrollFrameRef.current !== null) return
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      processScroll()
    })
  }, [processScroll])

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

  const handleFontSizeChange = useCallback((delta: number): void => {
    setFontSize((prev) => {
      const next = Math.max(FONT_SIZE_MIN, Math.min(prev + delta, FONT_SIZE_MAX))
      void window.api.settings.setFontSize(next)
      return next
    })
  }, [])

  const handleFontFamilyChange = useCallback((newFont: string): void => {
    setFontFamily(newFont)
    void window.api.settings.setFontFamily(newFont)
  }, [])

  const handleLineHeightChange = useCallback((delta: number): void => {
    setLineHeight((prev) => {
      const next = Number(Math.max(LINE_HEIGHT_MIN, Math.min(prev + delta, LINE_HEIGHT_MAX)).toFixed(1))
      void window.api.settings.setLineHeight(next)
      return next
    })
  }, [])

  /**
   * 状态栏标题必须跟随当前可见章节。
   *
   * 早期实现固定显示打开书籍时的 chapterContent.title，连续滚动到下一章后
   * 标题仍然停留在第一章，而章节计数已经变化，两者互相矛盾。
   *
   * 这里必须读 state（loadedChapterContents）而不是 ref（loadedChapterMap）：
   * ref 的写入不会触发重渲染，在 render 期间读 ref 属于未定义行为，
   * 一旦某个写入路径漏掉配套的 setState，标题就会静默停留在旧值。
   */
  const activeChapterTitle =
    loadedChapterContents.find((chapter) => chapter.chapterIndex === currentChapterIndex)?.title ??
    (chapterContent?.chapterIndex === currentChapterIndex ? chapterContent.title : null) ??
    chapters[currentChapterIndex]?.title ??
    chapterContent?.title ??
    '正文'

  return (
    <div className="reader-view" onMouseMove={handleReaderMouseMove}>
      <ReaderToolbar
        open={toolbarOpen}
        onOpenChange={setToolbarOpen}
        onReveal={revealToolbar}
        onHide={hideToolbar}
        onBack={onBack}
        chapterListVisible={chapterListVisible}
        chapterListTriggerRef={chapterListTriggerRef}
        onToggleChapterList={onToggleChapterList}
        currentChapterIndex={currentChapterIndex}
        chapters={chapters}
        onSelectChapter={onSelectChapter}
        fontSize={fontSize}
        fontFamily={fontFamily}
        lineHeight={lineHeight}
        onFontSizeChange={handleFontSizeChange}
        onFontFamilyChange={handleFontFamilyChange}
        onLineHeightChange={handleLineHeightChange}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={onSearch}
        searchResults={searchResults}
        onSelectSearchResult={onSelectSearchResult}
        bookmarks={bookmarks}
        onAddBookmark={onAddBookmark}
        onSelectBookmark={onSelectBookmark}
        onRemoveBookmark={onRemoveBookmark}
        settingsSlot={settingsSlot}
      />

      <ReaderSurface
        contentRef={contentRef}
        content={content}
        loadedChapterContents={loadedChapterContents}
        fontSize={fontSize}
        fontFamily={fontFamily}
        lineHeight={lineHeight}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onClick={collapseToolbarImmediately}
      />

      <ReaderStatusBar
        chapterIndex={currentChapterIndex}
        chapterCount={chapters.length}
        title={activeChapterTitle}
        percentage={percentage}
      />
    </div>
  )
}
