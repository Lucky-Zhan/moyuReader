import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './ReaderPopover.css'

export interface ReaderPopoverTriggerProps {
  onClick: () => void
  'aria-expanded': boolean
  'aria-haspopup': 'dialog'
  'data-popover-trigger': true
}

export interface ReaderPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: (props: ReaderPopoverTriggerProps) => ReactNode
  children: ReactNode
  className?: string
  panelClassName?: string
  ariaLabel?: string
}

/**
 * Small anchored popover primitive used by the reader toolbar and settings.
 * It owns only outside-click, Escape and focus-return behavior; the caller
 * keeps the actual settings state.
 */
export function ReaderPopover({
  open,
  onOpenChange,
  trigger,
  children,
  className = '',
  panelClassName = '',
  ariaLabel
}: ReaderPopoverProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  const toggle = useCallback((): void => {
    onOpenChange(!open)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent): void => {
      if (rootRef.current?.contains(event.target as Node)) return
      onOpenChange(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onOpenChange(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onOpenChange, open])

  useEffect(() => {
    const root = rootRef.current
    if (root) {
      // Keep a small DOM state mirror for callers that previously used a
      // native disclosure element. It is intentionally not used for styling.
      const disclosure = root as unknown as HTMLDetailsElement
      disclosure.open = open
    }
  }, [open])

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }
    if (!wasOpenRef.current) return
    wasOpenRef.current = false
    const triggerElement = rootRef.current?.querySelector<HTMLElement>('[data-popover-trigger]')
    const activeElement = document.activeElement
    if (
      triggerElement &&
      rootRef.current &&
      (activeElement === document.body || rootRef.current.contains(activeElement))
    ) {
      triggerElement.focus()
    }
  }, [open])

  return (
    <div ref={rootRef} className={`reader-popover ${className}`.trim()} data-no-window-drag>
      {trigger({
        onClick: toggle,
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'data-popover-trigger': true
      })}
      <div
        className={`reader-popover-panel ${panelClassName}`.trim()}
        role="dialog"
        aria-label={open ? ariaLabel : undefined}
        aria-hidden={!open}
        data-open={open}
      >
        {children}
      </div>
    </div>
  )
}

export default ReaderPopover
