import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode, RefObject } from 'react'
import type { Bookmark, Chapter, SearchResult } from '@shared/types'
import {
  DEFAULT_FONT_FAMILY,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP
} from '@shared/constants'
import Icon from './Icon'
import ReaderPopover from './ReaderPopover'

export interface ReaderToolbarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReveal: () => void
  onHide: () => void
  onBack: () => void
  chapterListVisible: boolean
  chapterListTriggerRef?: RefObject<HTMLButtonElement>
  onToggleChapterList: () => void
  currentChapterIndex: number
  chapters: Chapter[]
  onSelectChapter?: (index: number) => void | Promise<void>
  fontSize: number
  fontFamily: string
  lineHeight: number
  onFontSizeChange: (delta: number) => void
  onFontFamilyChange: (fontFamily: string) => void
  onLineHeightChange: (delta: number) => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  onSearch?: (query: string) => void | Promise<void>
  searchResults: SearchResult[]
  onSelectSearchResult?: (result: SearchResult) => void | Promise<void>
  bookmarks: Bookmark[]
  onAddBookmark?: () => void | Promise<void>
  onSelectBookmark?: (bookmark: Bookmark) => void | Promise<void>
  onRemoveBookmark?: (bookmarkId: string) => void | Promise<void>
  settingsSlot?: ReactNode
}

const FONT_OPTIONS = [
  { value: DEFAULT_FONT_FAMILY, label: '宋体（衬线）' },
  { value: '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif', label: '苹方（无衬线）' },
  { value: '"Heiti SC", "Microsoft YaHei", sans-serif', label: '黑体' },
  { value: 'Georgia, "Times New Roman", serif', label: '西文衬线' },
  { value: 'Consolas, monospace', label: '等宽 Consolas' },
  { value: '"Source Code Pro", monospace', label: '源码等宽' },
  { value: 'Monaco, monospace', label: '苹果等宽' },
  { value: 'monospace', label: '系统等宽' }
]

/**
 * Floating reader chrome. The details element is intentionally kept as the
 * outer disclosure surface for native keyboard semantics and compatibility;
 * all nested menus use ReaderPopover so they cannot pierce the text canvas.
 */
export function ReaderToolbar({
  open,
  onOpenChange,
  onReveal,
  onHide,
  onBack,
  chapterListVisible,
  chapterListTriggerRef,
  onToggleChapterList,
  currentChapterIndex,
  chapters,
  onSelectChapter,
  fontSize,
  fontFamily,
  lineHeight,
  onFontSizeChange,
  onFontFamilyChange,
  onLineHeightChange,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searchResults,
  onSelectSearchResult,
  bookmarks,
  onAddBookmark,
  onSelectBookmark,
  onRemoveBookmark,
  settingsSlot
}: ReaderToolbarProps): JSX.Element {
  const drawerRef = useRef<HTMLDetailsElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const fontTriggerRef = useRef<HTMLButtonElement>(null)
  const bookmarkTriggerRef = useRef<HTMLButtonElement>(null)
  const [fontOpen, setFontOpen] = useState(false)
  const [bookmarkOpen, setBookmarkOpen] = useState(false)

  useEffect(() => {
    if (open) return
    setFontOpen(false)
    setBookmarkOpen(false)
    ;[drawerRef.current, toolbarRef.current].forEach((root) => {
      root?.querySelectorAll<HTMLElement>('[data-popover-trigger]').forEach((element) => {
        element.blur()
      })
    })
  }, [open])

  useEffect(() => {
    if (!chapterListVisible) return
    setFontOpen(false)
    setBookmarkOpen(false)
  }, [chapterListVisible])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !open) return
      event.preventDefault()
      onOpenChange(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onOpenChange, open])

  const handleSummaryClick = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      event.preventDefault()
      if (!open) onReveal()
      onOpenChange(!open)
    },
    [onOpenChange, onReveal, open]
  )

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault()
      const query = searchQuery.trim()
      if (!query || !onSearch) return
      void onSearch(query)
    },
    [onSearch, searchQuery]
  )

  const handleSelectSearchResult = useCallback(
    (result: SearchResult): void => {
      void onSelectSearchResult?.(result)
      onOpenChange(false)
    },
    [onOpenChange, onSelectSearchResult]
  )

  const handleSelectBookmark = useCallback(
    (bookmark: Bookmark): void => {
      void onSelectBookmark?.(bookmark)
      onOpenChange(false)
    },
    [onOpenChange, onSelectBookmark]
  )

  const previousDisabled = !onSelectChapter || currentChapterIndex <= 0
  const nextDisabled = !onSelectChapter || currentChapterIndex >= chapters.length - 1

  return (
    <>
      <div
        className={`reader-toolbar-reveal-zone${open ? ' is-drag' : ''}`}
        aria-hidden="true"
        onMouseEnter={onReveal}
        onMouseLeave={onHide}
      />
      <details
        ref={drawerRef}
        className={`reader-toolbar-drawer${open ? ' is-open' : ''}`}
        open={open}
        onMouseEnter={onReveal}
        onMouseLeave={onHide}
      >
        <summary
          className="reader-toolbar-drawer-trigger"
          aria-label="显示/隐藏阅读工具栏"
          data-tooltip="显示/隐藏阅读工具栏"
          onClick={handleSummaryClick}
        >
          <Icon name="menu" size={17} />
        </summary>
      </details>

      <div
        ref={toolbarRef}
        className={`reader-toolbar${open ? ' is-open' : ''}`}
        role="toolbar"
        aria-label="阅读工具栏"
        data-open={open}
        onMouseEnter={onReveal}
        onMouseLeave={onHide}
      >
        <div className="reader-toolbar-group reader-toolbar-left">
          <button
            className="reader-icon-btn reader-toolbar-back"
            onClick={onBack}
            aria-label="返回"
            data-tooltip="返回书架"
            type="button"
          >
            <Icon name="arrow-left" />
          </button>
          <span className="reader-toolbar-separator" aria-hidden="true" />
          <button
            ref={chapterListTriggerRef}
            className={`reader-icon-btn ${chapterListVisible ? 'active' : ''}`}
            onClick={onToggleChapterList}
            aria-label={chapterListVisible ? '隐藏目录' : '显示目录'}
            data-tooltip={chapterListVisible ? '隐藏目录' : '显示目录'}
            type="button"
          >
            <Icon name="list" />
          </button>
        </div>

        <div className="reader-toolbar-group reader-toolbar-center">
          <ReaderPopover
            className="reader-font-settings"
            open={fontOpen}
            onOpenChange={setFontOpen}
            trigger={(triggerProps) => (
              <button
                ref={fontTriggerRef}
                className="reader-font-settings-trigger reader-toolbar-control"
                type="button"
                aria-label="阅读排版设置"
                data-tooltip="排版"
                {...triggerProps}
              >
                <span aria-hidden="true">Aa</span>
              </button>
            )}
            panelClassName="reader-font-settings-popover"
          >
            <div className="reader-font-controls">
              <span className="reader-popover-label">字号</span>
              <button
                className="reader-font-btn"
                type="button"
                onClick={() => onFontSizeChange(-FONT_SIZE_STEP)}
                disabled={fontSize <= FONT_SIZE_MIN}
                aria-label="减小字号"
                data-tooltip="减小字号"
              >
                −
              </button>
              <span className="reader-font-size-display">{fontSize}px</span>
              <button
                className="reader-font-btn"
                type="button"
                onClick={() => onFontSizeChange(FONT_SIZE_STEP)}
                disabled={fontSize >= FONT_SIZE_MAX}
                aria-label="增大字号"
                data-tooltip="增大字号"
              >
                +
              </button>
            </div>
            <span className="reader-toolbar-separator" aria-hidden="true" />
            <label className="reader-font-controls">
              <span className="reader-popover-label">字体</span>
              <select
                className="reader-font-family-select"
                value={fontFamily}
                onChange={(event) => onFontFamilyChange(event.target.value)}
                aria-label="选择字体"
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>{font.label}</option>
                ))}
              </select>
            </label>
            <span className="reader-toolbar-separator" aria-hidden="true" />
            <div className="reader-font-controls">
              <span className="reader-popover-label">行距</span>
              <button
                className="reader-font-btn"
                type="button"
                onClick={() => onLineHeightChange(-LINE_HEIGHT_STEP)}
                disabled={lineHeight <= LINE_HEIGHT_MIN}
                aria-label="减小行距"
                data-tooltip="减小行距"
              >
                −
              </button>
              <span className="reader-font-size-display">{lineHeight.toFixed(1)}</span>
              <button
                className="reader-font-btn"
                type="button"
                onClick={() => onLineHeightChange(LINE_HEIGHT_STEP)}
                disabled={lineHeight >= LINE_HEIGHT_MAX}
                aria-label="增大行距"
                data-tooltip="增大行距"
              >
                +
              </button>
            </div>
          </ReaderPopover>

          <span className="reader-toolbar-separator" aria-hidden="true" />
          <button
            className="reader-icon-btn reader-chapter-nav-btn"
            onClick={() => {
              if (!previousDisabled) void onSelectChapter?.(currentChapterIndex - 1)
            }}
            disabled={previousDisabled}
            aria-label="上一章"
            data-tooltip="上一章"
            type="button"
          >
            <Icon name="chevron-left" />
          </button>
          <button
            className="reader-icon-btn reader-chapter-nav-btn"
            onClick={() => {
              if (!nextDisabled) void onSelectChapter?.(currentChapterIndex + 1)
            }}
            disabled={nextDisabled}
            aria-label="下一章"
            data-tooltip="下一章"
            type="button"
          >
            <Icon name="chevron-right" />
          </button>
        </div>

        <div className="reader-toolbar-group reader-toolbar-right">
          <form className="reader-search-form" onSubmit={handleSearchSubmit}>
            <div className="reader-search-field" data-no-window-drag>
              <Icon name="search" size={16} />
              <input
                className="reader-search-input"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="搜索正文"
                aria-label="搜索正文"
              />
            </div>
            <button
              className="reader-icon-btn reader-search-submit"
              type="submit"
              disabled={!onSearch || searchQuery.trim().length === 0}
              aria-label="搜索"
              data-tooltip="搜索正文"
            >
              <Icon name="search" />
              <span className="reader-search-submit-label">搜索</span>
            </button>
          </form>

          <button
            className="reader-icon-btn"
            onClick={() => void onAddBookmark?.()}
            disabled={!onAddBookmark}
            aria-label="添加书签"
            data-tooltip="添加书签"
            type="button"
          >
            <Icon name="bookmark" />
          </button>

          <ReaderPopover
            open={bookmarkOpen}
            onOpenChange={setBookmarkOpen}
            trigger={(triggerProps) => (
              <button
                ref={bookmarkTriggerRef}
                className="reader-toolbar-control reader-bookmark-trigger"
                type="button"
                aria-label={`书签 ${bookmarks.length}`}
                data-tooltip="书签列表"
                {...triggerProps}
              >
                <Icon name="bookmark" size={15} />
                <span>书签 {bookmarks.length}</span>
              </button>
            )}
            panelClassName="reader-bookmark-list"
            ariaLabel="书签列表"
          >
            {bookmarks.length === 0 ? (
              <div className="reader-bookmark-empty">暂无书签</div>
            ) : (
              bookmarks.map((bookmark) => (
                <div key={bookmark.id} className="reader-bookmark-item">
                  <button
                    className="reader-bookmark-jump"
                    type="button"
                    onClick={() => handleSelectBookmark(bookmark)}
                    title={bookmark.excerpt}
                  >
                    <span>{bookmark.title}</span>
                    <small>{bookmark.percentage}%</small>
                  </button>
                  <button
                    className="reader-bookmark-remove"
                    type="button"
                    onClick={() => void onRemoveBookmark?.(bookmark.id)}
                    aria-label={`删除书签 ${bookmark.title}`}
                    title={`删除书签 ${bookmark.title}`}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))
            )}
          </ReaderPopover>

          {settingsSlot && <div className="reader-toolbar-settings">{settingsSlot}</div>}
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="reader-search-results" role="list" aria-label="搜索结果">
          {searchResults.map((result, index) => (
            <button
              key={`${result.chapterIndex}-${result.absoluteOffset}-${index}`}
              className="reader-search-result"
              onClick={() => handleSelectSearchResult(result)}
              role="listitem"
              title={result.snippet}
              type="button"
            >
              <span className="reader-search-result-title">{result.chapterTitle}</span>
              <span className="reader-search-result-snippet">{result.snippet}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default ReaderToolbar
