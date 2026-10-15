import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

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

/**
 * 模态确认对话框。
 *
 * 改用 MUI Dialog：此前手写实现了焦点陷阱、Escape 关闭、关闭后焦点归还，
 * 以及 role="alertdialog" 语义——这些正是 MUI Dialog 的内置行为，且覆盖了
 * 更多边界（滚动锁定、aria-hidden 管理、多层对话框堆叠）。
 *
 * 保留原有 props 形状，调用方无需改动。配色来自 App 注入的 MUI 主题，
 * 会随伪装主题（dark/light/paper/code/terminal）一起变化。
 *
 * 注意同步卸载：
 * MUI Modal 在 open 变 false 后要等过渡结束才卸载子树（Modal.js 的
 * `!keepMounted && !open && (!hasTransition || exited)` 分支），实测关闭后
 * 元素仍在 DOM 中，对屏幕阅读器意味着「已关闭的对话框还能被读到」。
 * 旧实现是同步卸载，这里在 open 为 false 时直接返回 null 保持一致。
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
  // 关闭后把焦点还给触发元素。
  //
  // 旧实现自己做了这件事；改用 MUI 后，因为我们在 open 为 false 时直接
  // 返回 null（同步卸载），MUI 的焦点还原逻辑来不及执行，焦点会掉到 body。
  // 键盘用户关掉删除确认后必须回到原来的「删除」按钮上。
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }

    const previous = restoreFocusRef.current
    restoreFocusRef.current = null
    if (previous && document.contains(previous)) {
      previous.focus()
    }
  }, [open])

  // Escape 关闭。
  //
  // MUI 的 Escape 监听挂在 modal 根节点上，只有焦点在对话框内部时才生效。
  // 旧实现监听 document，无论焦点在哪都能关闭。这里补回 document 级监听，
  // 保证「焦点意外跑到对话框外」时 Escape 依然有效。
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, open])

  // 同步卸载：open 为 false 时直接不渲染。
  // MUI 的异步卸载会让 queryByRole('alertdialog') 在关闭后仍能命中，
  // 对屏幕阅读器也意味着「已关闭的对话框还能被读到」。
  if (!open) return null

  return (
    <Dialog
      open={open}
      keepMounted={false}
      onClose={(_event, reason) => {
        // 点击遮罩与 Escape 都走取消；避免误触导致危险操作被确认。
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') onCancel()
      }}
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? 'confirm-dialog-description' : undefined}
      maxWidth="xs"
      fullWidth
      slotProps={{
        // MUI Dialog 默认 role="dialog"；这里要的是 alertdialog——它会打断
        // 屏幕阅读器当前的朗读，符合「删除确认」这类需要立即注意的场景。
        root: { role: 'alertdialog' },
        paper: {
          sx: {
            borderRadius: 'var(--control-radius-lg)',
            border: '1px solid var(--separator)',
            backgroundImage: 'none',
            boxShadow: 'var(--shadow-lg)'
          }
        }
      }}
    >
      <DialogTitle id="confirm-dialog-title" sx={{ fontSize: 'var(--text-lg)', fontWeight: 650 }}>
        {title}
      </DialogTitle>

      {description && (
        <DialogContent>
          <DialogContentText
            id="confirm-dialog-description"
            sx={{ color: 'var(--ink-secondary)', fontSize: 'var(--text-base)' }}
          >
            {description}
          </DialogContentText>
        </DialogContent>
      )}

      <DialogActions sx={{ padding: '12px 20px 18px', gap: '8px' }}>
        <Button
          onClick={onCancel}
          variant="text"
          // 危险操作的默认落点是「取消」，与旧实现一致。
          autoFocus
          sx={{ color: 'var(--ink-secondary)' }}
        >
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color={destructive ? 'error' : 'primary'}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default ConfirmDialog
