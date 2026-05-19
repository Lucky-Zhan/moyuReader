import { useCallback, useEffect, useRef, useState } from 'react'
import type { Chapter, ReadingProgress } from '../../../shared/types'
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

export interface ReaderViewProps {
  /** 书籍文本内容 */
  content: string
  /** 章节列表 */
  chapters: Chapter[]
  /** 当前阅读进度 */
  progress: ReadingProgress
  /** 进度变化回调 */
  onProgressChange: (progress: ReadingProgress) => void
  /** 返回书架回调 */
  onBack: () => void
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
  chapters,
  progress,
  onProgressChange,
  onBack,
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
  const lastNavigationKey = useRef<number | null>(null)

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

    const el = contentRef.current
    if (!el) return

    if (lastNavigationKey.current === navigationKey) {
      return
    }
    lastNavigationKey.current = navigationKey

    if (progress.scrollPosition > 0) {
      if (Math.abs(el.scrollTop - progress.scrollPosition) > 2) {
        el.scrollTop = progress.scrollPosition
      }
      return
    }

    if (progress.chapterIndex > 0 && chapters[progress.chapterIndex] && content.length > 0) {
      const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0)
      const ratio = chapters[progress.chapterIndex].offset / content.length
      const nextScrollTop = Math.round(maxScroll * ratio)
      if (Math.abs(el.scrollTop - nextScrollTop) > 2) {
        el.scrollTop = nextScrollTop
      }
    }
  }, [chapters, content, navigationKey, progress])

  /**
   * Calculate reading percentage based on scroll position
   */
  const calculatePercentage = useCallback((): number => {
    const el = contentRef.current
    if (!el) return 0
    const { scrollTop, scrollHeight, clientHeight } = el
    const maxScroll = scrollHeight - clientHeight
    if (maxScroll <= 0) return 100
    const pct = Math.round((scrollTop / maxScroll) * 100)
    return Math.max(0, Math.min(100, pct))
  }, [])

  /**
   * Handle scroll events to update progress
   */
  const handleScroll = useCallback((): void => {
    const el = contentRef.current
    if (!el) return

    const pct = calculatePercentage()
    setPercentage(pct)

    // Determine current chapter based on scroll position
    let chapterIndex = 0
    if (chapters.length > 0 && content.length > 0) {
      const scrollRatio = el.scrollTop / Math.max(el.scrollHeight - el.clientHeight, 1)
      const charPosition = Math.round(scrollRatio * content.length)
      for (let i = chapters.length - 1; i >= 0; i--) {
        if (charPosition >= chapters[i].offset) {
          chapterIndex = i
          break
        }
      }
    }

    const nextProgress = {
      chapterIndex,
      scrollPosition: el.scrollTop,
      percentage: pct
    }

    onProgressChange(nextProgress)
  }, [calculatePercentage, chapters, content, onProgressChange])

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
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        el.scrollTop -= el.clientHeight
      }
    },
    []
  )

  /**
   * Increase font size by step
   */
  const increaseFontSize = useCallback((): void => {
    setFontSize((prev) => {
      const next = Math.min(prev + FONT_SIZE_STEP, FONT_SIZE_MAX)
      window.api.invoke('settings:setFontSize', next)
      return next
    })
  }, [])

  /**
   * Decrease font size by step
   */
  const decreaseFontSize = useCallback((): void => {
    setFontSize((prev) => {
      const next = Math.max(prev - FONT_SIZE_STEP, FONT_SIZE_MIN)
      window.api.invoke('settings:setFontSize', next)
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
      window.api.invoke('settings:setFontFamily', newFont)
    },
    []
  )

  const increaseLineHeight = useCallback((): void => {
    setLineHeight((prev) => {
      const next = Number(Math.min(prev + LINE_HEIGHT_STEP, LINE_HEIGHT_MAX).toFixed(1))
      window.api.invoke('settings:setLineHeight', next)
      return next
    })
  }, [])

  const decreaseLineHeight = useCallback((): void => {
    setLineHeight((prev) => {
      const next = Number(Math.max(prev - LINE_HEIGHT_STEP, LINE_HEIGHT_MIN).toFixed(1))
      window.api.invoke('settings:setLineHeight', next)
      return next
    })
  }, [])

  return (
    <div className="reader-view">
      {/* Toolbar */}
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

        <div className="reader-toolbar-separator" />

        {/* Font size controls */}
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

        {/* Font family selector */}
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

        <div className="reader-toolbar-separator" />

      </div>

      {/* Content area */}
      <div
        ref={contentRef}
        className="reader-content"
        tabIndex={0}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        style={{
          fontSize: `${fontSize}px`,
          fontFamily,
          lineHeight
        }}
        role="document"
        aria-label="阅读内容"
      >
        {content}
      </div>

      {/* Status bar with progress */}
      <div className="reader-status-bar">
        <span className="reader-progress-text">阅读进度：{percentage}%</span>
      </div>
    </div>
  )
}
