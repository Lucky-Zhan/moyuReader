import { useCallback, useState } from 'react'
import type {
  DisguiseTheme as DisguiseThemeType,
  MouseLeaveAction
} from '@shared/types'
import {
  DEFAULT_MOUSE_LEAVE_ACTION,
  DEFAULT_MOUSE_LEAVE_QUIT_DELAY,
  MOUSE_LEAVE_DELAY_MIN,
  MOUSE_LEAVE_DELAY_MAX,
  MOUSE_LEAVE_DELAY_STEP,
  DEFAULT_MOUSE_RETURN_DELAY,
  MOUSE_RETURN_DELAY_MIN,
  MOUSE_RETURN_DELAY_MAX,
  MOUSE_RETURN_DELAY_STEP
} from '@shared/constants'
import Icon from './Icon'
import ReaderPopover from './ReaderPopover'
import './DisguiseTheme.css'

export interface DisguiseThemeProps {
  /** 当前选中的伪装主题 */
  theme: DisguiseThemeType
  /** 隐蔽模式是否启用 */
  stealthEnabled: boolean
  /** 鼠标移出后的行为 */
  mouseLeaveAction?: MouseLeaveAction
  /** 鼠标移出后的延迟时间（ms） */
  mouseLeaveDelay?: number
  /** 鼠标回到原位置后的显形延迟（ms） */
  mouseReturnDelay?: number
  /** 主题切换回调 */
  onThemeChange: (theme: DisguiseThemeType) => void
  /** 隐蔽模式开关回调 */
  onStealthEnabledChange: (enabled: boolean) => void
  /** 鼠标移出行为回调 */
  onMouseLeaveActionChange?: (action: MouseLeaveAction) => void
  /** 鼠标移出延迟回调 */
  onMouseLeaveDelayChange?: (delay: number) => void
  /** 鼠标回到原位置后的显形延迟回调 */
  onMouseReturnDelayChange?: (delay: number) => void
}

/** 配色主题 */
const THEME_OPTIONS: { value: DisguiseThemeType; label: string }[] = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'paper', label: '纸张' },
  { value: 'code', label: '代码' },
  { value: 'terminal', label: '终端' }
]

/**
 * 阅读设置组件
 */
export function DisguiseTheme({
  theme,
  stealthEnabled,
  mouseLeaveAction = DEFAULT_MOUSE_LEAVE_ACTION,
  mouseLeaveDelay = DEFAULT_MOUSE_LEAVE_QUIT_DELAY,
  mouseReturnDelay = DEFAULT_MOUSE_RETURN_DELAY,
  onThemeChange,
  onStealthEnabledChange,
  onMouseLeaveActionChange = () => {},
  onMouseLeaveDelayChange = () => {},
  onMouseReturnDelayChange = () => {}
}: DisguiseThemeProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const handleThemeSelect = useCallback(
    (selectedTheme: DisguiseThemeType) => {
      if (selectedTheme !== theme) {
        onThemeChange(selectedTheme)
      }
    },
    [theme, onThemeChange]
  )

  return (
    <ReaderPopover
      open={open}
      onOpenChange={setOpen}
      className="disguise-theme-selector reader-popover--right"
      panelClassName="disguise-theme-menu"
      ariaLabel="阅读设置菜单"
      trigger={(triggerProps) => (
        <button
          className="disguise-theme-trigger"
          type="button"
          aria-label="阅读设置"
          data-tooltip="阅读设置"
          data-tooltip-align="end"
          {...triggerProps}
        >
          <Icon name="settings" size={18} />
        </button>
      )}
    >
      <div className="disguise-theme-menu-label">配色</div>
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          className={`disguise-theme-btn ${theme === option.value ? 'active' : ''}`}
          onClick={() => handleThemeSelect(option.value)}
          aria-pressed={theme === option.value}
          aria-label={`切换到${option.label}配色`}
        >
          {option.label}
        </button>
      ))}
      <div className="disguise-theme-menu-separator" />
      <label className="disguise-theme-toggle">
        <input
          type="checkbox"
          checked={stealthEnabled}
          onChange={(event) => onStealthEnabledChange(event.target.checked)}
        />
        <span>隐身模式</span>
      </label>
      <div className="disguise-theme-menu-separator" />
      <div className="disguise-stealth-settings" aria-label="隐身行为设置">
        <label className="disguise-setting-label" htmlFor="mouse-leave-action">
            鼠标移出行为
        </label>
        <select
          id="mouse-leave-action"
          className="disguise-setting-select"
          value={mouseLeaveAction}
          onChange={(event) =>
            onMouseLeaveActionChange(event.target.value as MouseLeaveAction)
          }
          disabled={!stealthEnabled}
          aria-label="鼠标移出行为"
        >
          <option value="hide">移出后隐藏</option>
          <option value="deferred-quit">隐藏后延迟退出</option>
          <option value="quit">移出后立即退出</option>
        </select>

        <label className="disguise-setting-label" htmlFor="mouse-leave-delay">
            移出延迟
          <span className="disguise-setting-value">
            {Math.round(mouseLeaveDelay / 1000)} 秒
          </span>
        </label>
        <input
          id="mouse-leave-delay"
          className="disguise-setting-range"
          type="range"
          min={MOUSE_LEAVE_DELAY_MIN}
          max={MOUSE_LEAVE_DELAY_MAX}
          step={MOUSE_LEAVE_DELAY_STEP}
          value={mouseLeaveDelay}
          onChange={(event) => onMouseLeaveDelayChange(Number(event.target.value))}
          disabled={!stealthEnabled || mouseLeaveAction === 'quit'}
          aria-label="延迟秒数"
        />
        <label className="disguise-setting-label" htmlFor="mouse-return-delay">
            显形延迟
          <span className="disguise-setting-value">
            {Math.round(mouseReturnDelay / 1000)} 秒
          </span>
        </label>
        <input
          id="mouse-return-delay"
          className="disguise-setting-range"
          type="range"
          min={MOUSE_RETURN_DELAY_MIN}
          max={MOUSE_RETURN_DELAY_MAX}
          step={MOUSE_RETURN_DELAY_STEP}
          value={mouseReturnDelay}
          onChange={(event) => onMouseReturnDelayChange(Number(event.target.value))}
          disabled={!stealthEnabled || mouseLeaveAction === 'quit'}
          aria-label="显形延迟秒数"
        />
        {mouseLeaveAction === 'quit' && (
          <p className="disguise-setting-hint">立即退出已关闭延迟设置，请谨慎使用。</p>
        )}
      </div>
    </ReaderPopover>
  )
}

/**
 * 获取当前主题对应的 CSS 类名
 * 用于应用到父级阅读容器上
 */
export function getThemeClassName(theme: DisguiseThemeType): string {
  switch (theme) {
    case 'dark':
      return 'theme-dark'
    case 'light':
      return 'theme-light'
    case 'paper':
      return 'theme-paper'
    case 'code':
      return 'theme-code'
    case 'terminal':
      return 'theme-terminal'
    default:
      return 'theme-dark'
  }
}
