import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './ConfirmDialog.css'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 危险操作使用红色主按钮 */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  '[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

/**
 * 模态确认对话框。
 *
 * 负责完整的对话框语义：打开时把焦点移入、把 Tab 循环限制在对话框内、
 * Escape 取消、关闭后把焦点还给触发元素。此前的实现只在 div 上加了
 * role="alertdialog"，键盘用户打开后焦点仍停留在背后的列表上。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  destructive = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.offsetParent !== null || element === document.activeElement)

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!dialogRef.current.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onCancel]
  )

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    // 打开后把焦点移到取消按钮：危险操作的默认落点应是安全的那个。
    const focusTimer = window.setTimeout(() => {
      cancelButtonRef.current?.focus()
    }, 0)

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, open])

  useEffect(() => {
    if (open) return

    const previous = previouslyFocusedRef.current
    previouslyFocusedRef.current = null
    // 关闭后把焦点还给触发删除的按钮，避免焦点掉回 body。
    if (previous && document.contains(previous)) {
      previous.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="confirm-overlay" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title">{title}</h3>
        {description && <p id="confirm-dialog-description">{description}</p>}
        <div className="confirm-actions">
          <button
            ref={cancelButtonRef}
            className="confirm-btn confirm-btn-cancel"
            type="button"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`confirm-btn confirm-btn-ok${destructive ? ' is-destructive' : ''}`}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
