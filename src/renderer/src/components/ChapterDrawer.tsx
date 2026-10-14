import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Chapter } from '@shared/types'
import { ChapterList } from './ChapterList'
import Icon from './Icon'
import './ChapterDrawer.css'

export interface ChapterDrawerProps {
  open: boolean
  chapters: Chapter[]
  currentChapterIndex: number
  onSelectChapter: (index: number) => void | Promise<void>
  onClose: () => void
  triggerRef?: RefObject<HTMLButtonElement>
}

const DRAWER_EXIT_MS = 180

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )
  )
}

/**
 * Chapter navigation presentation layer.
 * It owns only transient drawer/focus behavior; chapter data and progress stay in App.
 */
export function ChapterDrawer({
  open,
  chapters,
  currentChapterIndex,
  onSelectChapter,
  onClose,
  triggerRef
}: ChapterDrawerProps): JSX.Element | null {
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousOpenRef = useRef(open)
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(open)

  useEffect(() => {
    let focusTimer: number | undefined
    let exitTimer: number | undefined

    if (open) {
      setMounted(true)
      setEntered(false)
      focusTimer = window.setTimeout(() => {
        setEntered(true)
        closeButtonRef.current?.focus()
      }, 0)
    } else {
      setEntered(false)
      if (previousOpenRef.current) {
        const focusTarget = triggerRef?.current ??
          document.querySelector<HTMLElement>('.reader-toolbar-drawer-trigger')
        focusTarget?.focus()
      }
      if (mounted) {
        exitTimer = window.setTimeout(() => setMounted(false), DRAWER_EXIT_MS)
      }
    }

    previousOpenRef.current = open

    return () => {
      if (focusTimer !== undefined) window.clearTimeout(focusTimer)
      if (exitTimer !== undefined) window.clearTimeout(exitTimer)
    }
  }, [open, triggerRef])

  const handleClose = useCallback((): void => {
    if (open) onClose()
  }, [onClose, open])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = getFocusableElements(panelRef.current)
      if (focusable.length === 0) {
        event.preventDefault()
        closeButtonRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleClose, open])

  const handleChapterSelect = useCallback(
    (index: number): void => {
      try {
        void Promise.resolve(onSelectChapter(index)).catch(() => undefined)
      } finally {
        onClose()
      }
    },
    [onClose, onSelectChapter]
  )

  if (!mounted) return null

  return (
    <>
      <div
        className={`chapter-drawer-backdrop${entered ? ' is-open' : ''}`}
        aria-hidden="true"
        onClick={handleClose}
      />
      <aside
        ref={panelRef}
        className={`chapter-drawer${entered ? ' is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-drawer-title"
        aria-hidden={!open}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="chapter-drawer-header">
          <div>
            <span className="chapter-drawer-kicker">NAVIGATION</span>
            <h2 id="chapter-drawer-title">目录</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="chapter-drawer-close"
            type="button"
            onClick={handleClose}
            aria-label="关闭目录"
            data-tooltip="关闭目录"
          >
            <Icon name="x" size={17} />
          </button>
        </div>
        <ChapterList
          chapters={chapters}
          currentChapterIndex={currentChapterIndex}
          onSelectChapter={handleChapterSelect}
        />
      </aside>
    </>
  )
}

export default ChapterDrawer
