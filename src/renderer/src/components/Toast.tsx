import { useState, useEffect, useCallback } from 'react'
import './Toast.css'

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

/** Toast 通知组件，自动在 3 秒后消失 */
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

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => {
      setMessage(null)
    }, 3000)
    return () => clearTimeout(timer)
  }, [message])

  // 监听 autosave:failed IPC 事件
  useEffect(() => {
    const handleAutosaveFailed = (): void => {
      showToast('保存失败，将在 30 秒后重试')
    }
    window.api.on('autosave:failed', handleAutosaveFailed)
    return () => {
      window.api.removeAllListeners('autosave:failed')
    }
  }, [])

  if (!message) return null

  return (
    <div className="toast" role="alert">
      <span className="toast-text">{message.text}</span>
    </div>
  )
}
