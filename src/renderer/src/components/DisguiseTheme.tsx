import { useCallback } from 'react'
import type { DisguiseTheme as DisguiseThemeType } from '../../../shared/types'
import './DisguiseTheme.css'

export interface DisguiseThemeProps {
  /** 当前选中的伪装主题 */
  theme: DisguiseThemeType
  /** 隐蔽模式是否启用 */
  stealthEnabled: boolean
  /** 主题切换回调 */
  onThemeChange: (theme: DisguiseThemeType) => void
  /** 隐蔽模式开关回调 */
  onStealthEnabledChange: (enabled: boolean) => void
}

/** 配色主题 */
const THEME_OPTIONS: { value: DisguiseThemeType; label: string }[] = [
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
  { value: 'paper', label: '纸张' }
]

/**
 * 阅读设置组件
 */
export function DisguiseTheme({
  theme,
  stealthEnabled,
  onThemeChange,
  onStealthEnabledChange
}: DisguiseThemeProps): JSX.Element {
  const handleThemeSelect = useCallback(
    (selectedTheme: DisguiseThemeType) => {
      if (selectedTheme !== theme) {
        onThemeChange(selectedTheme)
      }
    },
    [theme, onThemeChange]
  )

  return (
    <details className="disguise-theme-selector">
      <summary className="disguise-theme-trigger" aria-label="阅读设置">
        ...
      </summary>
      <div className="disguise-theme-menu" role="group" aria-label="阅读设置菜单">
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
      </div>
    </details>
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
    default:
      return 'theme-dark'
  }
}
