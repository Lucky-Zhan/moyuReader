import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_STEP,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_LINE_HEIGHT,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_STEP,
  AUTO_SAVE_INTERVAL,
  DEFAULT_HIDE_SHORTCUT
} from '../shared/constants'
import type { AppSettings } from '../shared/types'
import type { DisguiseTheme } from '../shared/types'

type LegacyDisguiseTheme = 'code-editor' | 'terminal'

/**
 * SettingsManager - 管理应用设置的持久化
 * 使用 electron-store 存储字体大小、字体、主题等设置
 */
export class SettingsManager {
  private store: any

  constructor(store: any) {
    this.store = store
  }

  /**
   * 设置字体大小
   * - 约束范围 [FONT_SIZE_MIN, FONT_SIZE_MAX]
   * - 四舍五入到最近的 FONT_SIZE_STEP 步长
   */
  setFontSize(size: number): void {
    // Clamp to valid range
    let clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size))
    // Round to nearest step
    clamped = Math.round(clamped / FONT_SIZE_STEP) * FONT_SIZE_STEP
    // Ensure still within bounds after rounding
    clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, clamped))

    const settings = this.getSettings()
    settings.fontSize = clamped
    this.store.set('settings', settings)
  }

  /**
   * 获取当前字体大小
   */
  getFontSize(): number {
    const settings = this.store.get('settings', {}) as Partial<AppSettings>
    return settings.fontSize ?? DEFAULT_FONT_SIZE
  }

  /**
   * 设置字体
   */
  setFontFamily(font: string): void {
    const settings = this.getSettings()
    settings.fontFamily = font
    this.store.set('settings', settings)
  }

  /**
   * 设置行间距
   */
  setLineHeight(lineHeight: number): void {
    let clamped = Math.max(LINE_HEIGHT_MIN, Math.min(LINE_HEIGHT_MAX, lineHeight))
    clamped = Math.round(clamped / LINE_HEIGHT_STEP) * LINE_HEIGHT_STEP
    clamped = Math.max(LINE_HEIGHT_MIN, Math.min(LINE_HEIGHT_MAX, clamped))

    const settings = this.getSettings()
    settings.lineHeight = Number(clamped.toFixed(1))
    this.store.set('settings', settings)
  }

  /**
   * 获取当前字体
   */
  getFontFamily(): string {
    const settings = this.store.get('settings', {}) as Partial<AppSettings>
    return settings.fontFamily ?? DEFAULT_FONT_FAMILY
  }

  /**
   * 设置伪装主题
   */
  setDisguiseTheme(theme: DisguiseTheme | LegacyDisguiseTheme): void {
    const settings = this.getSettings()
    settings.disguiseTheme = this.normalizeDisguiseTheme(theme)
    this.store.set('settings', settings)
  }

  /**
   * 设置隐蔽模式开关
   */
  setStealthEnabled(enabled: boolean): void {
    const settings = this.getSettings()
    settings.stealthEnabled = enabled
    this.store.set('settings', settings)
  }

  /**
   * 获取完整的应用设置
   */
  getSettings(): AppSettings {
    const stored = this.store.get('settings', {}) as Partial<AppSettings>
    const storedTheme = stored.disguiseTheme as DisguiseTheme | 'code-editor' | 'terminal' | undefined
    return {
      fontSize: stored.fontSize ?? DEFAULT_FONT_SIZE,
      fontFamily: stored.fontFamily ?? DEFAULT_FONT_FAMILY,
      lineHeight: stored.lineHeight ?? DEFAULT_LINE_HEIGHT,
      disguiseTheme: this.normalizeDisguiseTheme(storedTheme),
      stealthEnabled: stored.stealthEnabled ?? true,
      hideShortcut: stored.hideShortcut ?? DEFAULT_HIDE_SHORTCUT,
      autoSaveInterval: stored.autoSaveInterval ?? AUTO_SAVE_INTERVAL
    }
  }

  private normalizeDisguiseTheme(
    theme: DisguiseTheme | LegacyDisguiseTheme | undefined
  ): DisguiseTheme {
    if (theme === 'light' || theme === 'paper' || theme === 'dark') return theme
    if (theme === 'terminal' || theme === 'code') return theme
    if (theme === 'code-editor') return 'code'
    return 'dark'
  }
}
