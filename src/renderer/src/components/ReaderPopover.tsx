import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Popper from '@mui/material/Popper'
import Paper from '@mui/material/Paper'
import ClickAwayListener from '@mui/material/ClickAwayListener'
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
  /** 面板对齐到触发器的哪一侧；默认 start（左对齐） */
  anchor?: 'start' | 'end'
}

/**
 * 阅读器工具栏/设置使用的小型锚定浮层。
 *
 * 用 Popper + ClickAwayListener 而不是 MUI Popover：
 * Popover 基于 Modal，打开时 ModalManager 会给所有兄弟节点加 aria-hidden
 * （见 @mui/material/Modal/ModalManager.js 的 ariaHidden()），
 * 于是正文 role="document" 会从无障碍树消失——读屏用户一打开排版面板
 * 就读不到正文了。这个浮层是**非模态**的：正文仍可见、可滚动，
 * 只是不应该被误触。Popper 天生非模态，没有这个问题。
 *
 * 相比旧实现（纯 CSS absolute + right: 0）的改进：
 * - 会测量视口空间，靠近边缘时自动翻转/内收，不再溢出窗口
 * - Portal 到 body，不受 .reader-toolbar 的 overflow 裁剪
 *
 * 保留原有的 render-prop 触发器 API，调用方无需改动。
 */
export function ReaderPopover({
  open,
  onOpenChange,
  trigger,
  children,
  className = '',
  panelClassName = '',
  ariaLabel,
  anchor = 'start'
}: ReaderPopoverProps): JSX.Element {
  // 用 state 而非 ref 保存锚点：Popper 需要在锚点变化后重新定位，
  // ref 更新不会触发重渲染，首次打开时 anchorEl 可能仍是 null。
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const toggle = useCallback((): void => {
    onOpenChange(!open)
  }, [onOpenChange, open])

  const handleClose = useCallback((): void => {
    onOpenChange(false)
  }, [onOpenChange])

  // 触发器由调用方渲染，这里从包装元素里取出真实 DOM 节点作为锚点。
  const captureAnchor = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node
    if (!node) return
    const el = node.querySelector<HTMLElement>('[data-popover-trigger]')
    if (el) setAnchorEl(el)
  }, [])

  // 把 open 状态镜像到 DOM 的 .open 属性。
  // 这是旧实现留下的契约：调用方（ReaderView）与测试通过
  // `document.querySelector('.reader-popover').open` 读取浮层是否展开。
  // 面板现在 Portal 到 body，包装元素本身不再携带状态，因此显式同步。
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    ;(wrapper as unknown as HTMLDetailsElement).open = open
  }, [open])

  // Escape 关闭。Popper 不提供键盘处理，这里自己补上。
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onOpenChange(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onOpenChange, open])

  // 关闭后把焦点还给触发器，避免焦点掉回 body。
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      return
    }
    if (!wasOpenRef.current) return
    wasOpenRef.current = false

    const triggerEl = wrapperRef.current?.querySelector<HTMLElement>('[data-popover-trigger]')
    const active = document.activeElement
    if (
      triggerEl &&
      wrapperRef.current &&
      (active === document.body || wrapperRef.current.contains(active))
    ) {
      triggerEl.focus()
    }
  }, [open])

  return (
    <div ref={captureAnchor} className={`reader-popover ${className}`.trim()} data-no-window-drag>
      {trigger({
        onClick: toggle,
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'data-popover-trigger': true
      })}

      <Popper
        open={open}
        anchorEl={anchorEl}
        placement={anchor === 'end' ? 'bottom-end' : 'bottom-start'}
        // 交给 Popper 做碰撞检测：靠近视口边缘时自动翻转或内收。
        modifiers={[
          { name: 'offset', options: { offset: [0, 6] } },
          { name: 'flip', options: { fallbackPlacements: ['top-end', 'top-start'] } },
          { name: 'preventOverflow', options: { padding: 8 } }
        ]}
        sx={{ zIndex: 80 }}
      >
        <ClickAwayListener onClickAway={handleClose}>
          <Paper
            className={panelClassName}
            role="dialog"
            aria-label={ariaLabel}
            elevation={0}
            sx={{
              minWidth: '220px',
              padding: '12px',
              borderRadius: 'var(--control-radius-lg)',
              border: '1px solid var(--separator)',
              background: 'var(--material-popover)',
              backgroundImage: 'none',
              color: 'var(--ink-primary)',
              boxShadow: 'var(--shadow-lg)',
              backdropFilter: 'blur(16px) saturate(140%)'
            }}
          >
            {children}
          </Paper>
        </ClickAwayListener>
      </Popper>
    </div>
  )
}

export default ReaderPopover
