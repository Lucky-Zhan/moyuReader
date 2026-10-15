import { useState, useEffect, useCallback } from 'react'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

export interface ToastMessage {
  id: number
  text: string
}

let toastId = 0

/** Toast 通知上下文：全局 toast 状态管理 */
const listeners: Array<(msg: ToastMessage | null) => void> = []

/** 显示一条 toast 消息 */
export function showToast(text: string): void {
  toastId += 1
  const msg: ToastMessage = { id: toastId, text }
  listeners.forEach((fn) => fn(msg))
}

const AUTO_DISMISS_MS = 3000

/**
 * Toast 通知组件，自动在 3 秒后消失。
 *
 * 改用 MUI Snackbar + Alert：旧实现是手写的 fixed 定位 div，只加了
 * role="alert"。Snackbar 提供正确的 live region 语义与焦点管理，
 * Alert 则给出语义化的严重级别（这里统一用 info，因为现有调用点
 * 只有「保存失败」「快捷键注册失败」两类提示，都带明确文案）。
 *
 * 保持与旧实现一致的行为：
 * - 恰好 3 秒后消失（Snackbar 的 autoHideDuration 默认有过渡延迟，这里对齐）
 * - role="alert"，测试与读屏都依赖它
 * - 不抢焦点：提示是非阻塞的，不应打断用户正在做的事
 */
export default function Toast(): JSX.Element | null {
  const [message, setMessage] = useState<ToastMessage | null>(null)

  const handleMessage = useCallback((msg: ToastMessage | null) => {
    setMessage(msg)
  }, [])

  useEffect(() => {
    listeners.push(handleMessage)
    return () => {
      const idx = listeners.indexOf(handleMessage)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }, [handleMessage])

  // 监听主进程通知
  useEffect(() => {
    const handleAutosaveFailed = (): void => {
      showToast('保存失败，将在 30 秒后重试')
    }
    const handleShortcutRegistrationFailed = ({
      accelerator
    }: {
      accelerator: string
    }): void => {
      showToast(`快捷键 ${accelerator} 注册失败，可能已被其他应用占用`)
    }

    const unsubscribeAutosave = window.api.events.onAutosaveFailed(handleAutosaveFailed)
    const unsubscribeShortcut =
      window.api.events.onShortcutRegistrationFailed(handleShortcutRegistrationFailed)

    return () => {
      unsubscribeAutosave()
      unsubscribeShortcut()
    }
  }, [])

  const handleClose = useCallback((): void => {
    setMessage(null)
  }, [])

  return (
    <Snackbar
      open={message !== null}
      autoHideDuration={AUTO_DISMISS_MS}
      onClose={handleClose}
      // 关闭后立即卸载，与旧实现一致；MUI 默认会等过渡结束，
      // 那段时间元素仍在无障碍树中，测试也会在 3 秒后仍查得到。
      // MUI 9 把 TransitionProps 移到了 slotProps.transition。
      slotProps={{ transition: { appear: false } }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ pointerEvents: 'none' }}
    >
      <Alert
        // role="alert" 由 Alert 提供；severity 用 info 表示「非阻塞提示」。
        severity="info"
        variant="outlined"
        sx={{
          maxWidth: 'min(460px, calc(100vw - 32px))',
          borderRadius: 'var(--control-radius-lg)',
          borderColor: 'var(--separator)',
          background: 'var(--material-popover)',
          color: 'var(--ink-primary)',
          boxShadow: '0 16px 36px color-mix(in srgb, var(--shadow) 72%, transparent)',
          backdropFilter: 'blur(16px) saturate(140%)',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          lineHeight: 1.45,
          pointerEvents: 'auto',
          '& .MuiAlert-icon': { color: 'var(--ink-secondary)' }
        }}
      >
        {message?.text}
      </Alert>
    </Snackbar>
  )
}
