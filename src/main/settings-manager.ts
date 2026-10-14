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
  DEFAULT_HIDE_SHORTCUT,
  DEFAULT_MOUSE_LEAVE_ACTION,
  DEFAULT_MOUSE_LEAVE_QUIT_DELAY,
  MOUSE_LEAVE_DELAY_MIN,
  MOUSE_LEAVE_DELAY_MAX,
  MOUSE_LEAVE_DELAY_STEP,
  DEFAULT_MOUSE_RETURN_DELAY,
  MOUSE_RETURN_DELAY_MIN,
  MOUSE_RETURN_DELAY_MAX,
  MOUSE_RETURN_DELAY_STEP
} from '../shared/constants'
import type { AppSettings } from '../shared/types'
import type { DisguiseTheme, MouseLeaveAction } from '../shared/types'

type LegacyDisguiseTheme = 'code-editor' | 'terminal'

/**
 * 设置存储的 schema。
 *
 * 旧版本存的是 `Partial<AppSettings>` 的历史形态，可能包含已废弃的
 * `code-editor` 主题等，因此读取时按 unknown 处理并逐个字段归一化。
 */
interface SettingsSchema {
  settings: Partial<AppSettings> & { disguiseTheme?: DisguiseTheme | LegacyDisguiseTheme }
}

/** 仅使用到 get/set 的最小 store 接口，便于测试注入。 */
export interface SettingsStore {
  get<K extends keyof SettingsSchema>(key: K, defaultValue: SettingsSchema[K]): SettingsSchema[K]
  set<K extends keyof SettingsSchema>(key: K, value: SettingsSchema[K]): void
}

/**
 * SettingsManager - 管理应用设置的持久化
 * 使用 electron-store 存储字体大小、字体、主题等设置
 */
export class SettingsManager {
  private store: SettingsStore

  constructor(store: SettingsStore) {
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

  /** 设置鼠标移出后的行为。 */
  setMouseLeaveAction(action: MouseLeaveAction): void {
    const settings = this.getSettings()
    settings.mouseLeaveAction = this.normalizeMouseLeaveAction(action)
    this.store.set('settings', settings)
  }

  /** 设置鼠标移出后的延迟，按 1 秒步长规范化到 0–15 秒。 */
  setMouseLeaveDelay(delay: number): void {
    const settings = this.getSettings()
    settings.mouseLeaveDelay = this.normalizeMouseLeaveDelay(delay)
    this.store.set('settings', settings)
  }

  /** 设置鼠标回到隐藏位置后的显形延迟。 */
  setMouseReturnDelay(delay: number): void {
    const settings = this.getSettings()
    settings.mouseReturnDelay = this.normalizeMouseReturnDelay(delay)
    this.store.set('settings', settings)
  }

  /**
   * 获取完整的应用设置
   */
  getSettings(): AppSettings {
    const stored = this.store.get('settings', {}) as Partial<AppSettings>
    const storedTheme = stored.disguiseTheme as DisguiseTheme | 'code-editor' | 'terminal' | undefined
    const settings: AppSettings = {
      fontSize: stored.fontSize ?? DEFAULT_FONT_SIZE,
      fontFamily: stored.fontFamily ?? DEFAULT_FONT_FAMILY,
      lineHeight: stored.lineHeight ?? DEFAULT_LINE_HEIGHT,
      disguiseTheme: this.normalizeDisguiseTheme(storedTheme),
      stealthEnabled: typeof stored.stealthEnabled === 'boolean' ? stored.stealthEnabled : true,
      hideShortcut: stored.hideShortcut ?? DEFAULT_HIDE_SHORTCUT,
      mouseLeaveAction: this.normalizeMouseLeaveAction(stored.mouseLeaveAction),
      mouseLeaveDelay: this.normalizeMouseLeaveDelay(stored.mouseLeaveDelay),
      mouseReturnDelay: this.normalizeMouseReturnDelay(stored.mouseReturnDelay),
      autoSaveInterval: stored.autoSaveInterval ?? AUTO_SAVE_INTERVAL
    }

    // Persist newly introduced defaults and legacy theme migrations once they
    // are read. Merging preserves unrelated settings that older versions may
    // have stored alongside the typed application settings.
    const needsMigration =
      storedTheme !== settings.disguiseTheme ||
      stored.mouseLeaveAction !== settings.mouseLeaveAction ||
      stored.mouseLeaveDelay !== settings.mouseLeaveDelay ||
      stored.mouseReturnDelay !== settings.mouseReturnDelay
    if (needsMigration) {
      this.store.set('settings', { ...stored, ...settings })
    }

    return settings
  }

  private normalizeDisguiseTheme(
    theme: DisguiseTheme | LegacyDisguiseTheme | undefined
  ): DisguiseTheme {
    if (theme === 'light' || theme === 'paper' || theme === 'dark') return theme
    if (theme === 'terminal' || theme === 'code') return theme
    if (theme === 'code-editor') return 'code'
    return 'dark'
  }

  private normalizeMouseLeaveAction(action: unknown): MouseLeaveAction {
    if (action === 'hide' || action === 'quit' || action === 'deferred-quit') {
      return action
    }
    return DEFAULT_MOUSE_LEAVE_ACTION
  }

  private normalizeMouseLeaveDelay(delay: unknown): number {
    if (typeof delay !== 'number' || !Number.isFinite(delay)) {
      return DEFAULT_MOUSE_LEAVE_QUIT_DELAY
    }

    const clamped = Math.max(MOUSE_LEAVE_DELAY_MIN, Math.min(MOUSE_LEAVE_DELAY_MAX, delay))
    const rounded = Math.round(clamped / MOUSE_LEAVE_DELAY_STEP) * MOUSE_LEAVE_DELAY_STEP
    return Math.max(MOUSE_LEAVE_DELAY_MIN, Math.min(MOUSE_LEAVE_DELAY_MAX, rounded))
  }

  private normalizeMouseReturnDelay(delay: unknown): number {
    if (typeof delay !== 'number' || !Number.isFinite(delay)) {
      return DEFAULT_MOUSE_RETURN_DELAY
    }

    const clamped = Math.max(MOUSE_RETURN_DELAY_MIN, Math.min(MOUSE_RETURN_DELAY_MAX, delay))
    const rounded = Math.round(clamped / MOUSE_RETURN_DELAY_STEP) * MOUSE_RETURN_DELAY_STEP
    return Math.max(MOUSE_RETURN_DELAY_MIN, Math.min(MOUSE_RETURN_DELAY_MAX, rounded))
  }
}
