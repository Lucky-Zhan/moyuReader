import { describe, it, expect, beforeEach } from 'vitest'
import { SettingsManager } from '../../src/main/settings-manager'
import {
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_STEP,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  AUTO_SAVE_INTERVAL,
  DEFAULT_HIDE_SHORTCUT,
  DEFAULT_LINE_HEIGHT
} from '../../src/shared/constants'

/** 创建一个内存中的 mock store */
function createMockStore() {
  let data: Record<string, unknown> = {}

  return {
    get: (key: string, defaultValue?: unknown) => {
      const value = data[key]
      if (value === undefined) return defaultValue
      return JSON.parse(JSON.stringify(value))
    },
    set: (key: string, value: unknown) => {
      data[key] = JSON.parse(JSON.stringify(value))
    },
    delete: (key: string) => {
      delete data[key]
    }
  } as any
}

describe('SettingsManager', () => {
  let manager: SettingsManager
  let mockStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    mockStore = createMockStore()
    manager = new SettingsManager(mockStore)
  })

  describe('getFontSize()', () => {
    it('should return default font size when no setting exists', () => {
      expect(manager.getFontSize()).toBe(DEFAULT_FONT_SIZE)
    })

    it('should return persisted font size after setting', () => {
      manager.setFontSize(20)
      expect(manager.getFontSize()).toBe(20)
    })
  })

  describe('setFontSize()', () => {
    it('should set a valid font size within range', () => {
      manager.setFontSize(24)
      expect(manager.getFontSize()).toBe(24)
    })

    it('should clamp font size below minimum to FONT_SIZE_MIN', () => {
      manager.setFontSize(8)
      expect(manager.getFontSize()).toBe(FONT_SIZE_MIN)
    })

    it('should clamp font size above maximum to FONT_SIZE_MAX', () => {
      manager.setFontSize(60)
      expect(manager.getFontSize()).toBe(FONT_SIZE_MAX)
    })

    it('should round to nearest step (round down)', () => {
      manager.setFontSize(15) // between 14 and 16, rounds to 14 (15/2=7.5, round=8, 8*2=16)
      expect(manager.getFontSize()).toBe(16)
    })

    it('should round to nearest step (round up)', () => {
      manager.setFontSize(13) // between 12 and 14, rounds to 14 (13/2=6.5, round=7, 7*2=14)
      expect(manager.getFontSize()).toBe(14) // actually 13/2=6.5, Math.round(6.5)=7, 7*2=14
    })

    it('should handle exact step values without modification', () => {
      manager.setFontSize(12)
      expect(manager.getFontSize()).toBe(12)

      manager.setFontSize(48)
      expect(manager.getFontSize()).toBe(48)

      manager.setFontSize(30)
      expect(manager.getFontSize()).toBe(30)
    })

    it('should handle minimum boundary correctly', () => {
      manager.setFontSize(FONT_SIZE_MIN)
      expect(manager.getFontSize()).toBe(FONT_SIZE_MIN)
    })

    it('should handle maximum boundary correctly', () => {
      manager.setFontSize(FONT_SIZE_MAX)
      expect(manager.getFontSize()).toBe(FONT_SIZE_MAX)
    })

    it('should persist the font size to the store', () => {
      manager.setFontSize(22)
      const stored = mockStore.get('settings', {})
      expect(stored.fontSize).toBe(22)
    })

    it('should handle negative values by clamping to minimum', () => {
      manager.setFontSize(-5)
      expect(manager.getFontSize()).toBe(FONT_SIZE_MIN)
    })

    it('should handle zero by clamping to minimum', () => {
      manager.setFontSize(0)
      expect(manager.getFontSize()).toBe(FONT_SIZE_MIN)
    })
  })

  describe('getFontFamily()', () => {
    it('should return default font family when no setting exists', () => {
      expect(manager.getFontFamily()).toBe(DEFAULT_FONT_FAMILY)
    })

    it('should return persisted font family after setting', () => {
      manager.setFontFamily('Arial, sans-serif')
      expect(manager.getFontFamily()).toBe('Arial, sans-serif')
    })
  })

  describe('setFontFamily()', () => {
    it('should set and persist a custom font family', () => {
      manager.setFontFamily('Monaco, monospace')
      expect(manager.getFontFamily()).toBe('Monaco, monospace')
    })

    it('should persist the font family to the store', () => {
      manager.setFontFamily('Courier New, monospace')
      const stored = mockStore.get('settings', {})
      expect(stored.fontFamily).toBe('Courier New, monospace')
    })

    it('should allow setting back to default font', () => {
      manager.setFontFamily('Arial')
      manager.setFontFamily(DEFAULT_FONT_FAMILY)
      expect(manager.getFontFamily()).toBe(DEFAULT_FONT_FAMILY)
    })

    it('should handle empty string', () => {
      manager.setFontFamily('')
      expect(manager.getFontFamily()).toBe('')
    })
  })

  describe('setDisguiseTheme()', () => {
    it('should set and persist the disguise theme', () => {
      manager.setDisguiseTheme('paper')
      const settings = manager.getSettings()
      expect(settings.disguiseTheme).toBe('paper')
    })

    it('should persist code and terminal disguise themes', () => {
      manager.setDisguiseTheme('code')
      expect(manager.getSettings().disguiseTheme).toBe('code')

      manager.setDisguiseTheme('terminal')
      expect(manager.getSettings().disguiseTheme).toBe('terminal')
    })

    it('should migrate legacy code-editor theme to code', () => {
      manager.setDisguiseTheme('code-editor')
      expect(manager.getSettings().disguiseTheme).toBe('code')
    })

    it('should not lose other settings when updating theme', () => {
      mockStore.set('settings', {
        fontSize: 20,
        fontFamily: 'Menlo, monospace',
        disguiseTheme: 'dark',
        stealthEnabled: false,
        hideShortcut: 'CommandOrControl+H',
        autoSaveInterval: 60000
      })

      manager.setDisguiseTheme('paper')
      const settings = manager.getSettings()
      expect(settings).toEqual({
        fontSize: 20,
        fontFamily: 'Menlo, monospace',
        lineHeight: 1.8,
        disguiseTheme: 'paper',
        stealthEnabled: false,
        hideShortcut: 'CommandOrControl+H',
        autoSaveInterval: 60000
      })
    })
  })

  describe('setLineHeight()', () => {
    it('should set and persist line height', () => {
      manager.setLineHeight(2)
      const settings = manager.getSettings()
      expect(settings.lineHeight).toBe(2)
    })

    it('should clamp line height to supported range', () => {
      manager.setLineHeight(9)
      expect(manager.getSettings().lineHeight).toBe(3.6)

      manager.setLineHeight(0.5)
      expect(manager.getSettings().lineHeight).toBe(1)
    })
  })

  describe('setStealthEnabled()', () => {
    it('should set and persist the stealth mode state', () => {
      manager.setStealthEnabled(false)
      const settings = manager.getSettings()
      expect(settings.stealthEnabled).toBe(false)
    })

    it('should not lose other settings when updating stealth mode', () => {
      mockStore.set('settings', {
        fontSize: 20,
        fontFamily: 'Menlo, monospace',
        lineHeight: 1.8,
        disguiseTheme: 'paper',
        stealthEnabled: true,
        hideShortcut: 'CommandOrControl+H',
        autoSaveInterval: 60000
      })

      manager.setStealthEnabled(false)
      const settings = manager.getSettings()
      expect(settings).toEqual({
        fontSize: 20,
        fontFamily: 'Menlo, monospace',
        lineHeight: 1.8,
        disguiseTheme: 'paper',
        stealthEnabled: false,
        hideShortcut: 'CommandOrControl+H',
        autoSaveInterval: 60000
      })
    })
  })

  describe('getSettings()', () => {
    it('should return full default settings when store is empty', () => {
      const settings = manager.getSettings()
      expect(settings).toEqual({
        fontSize: DEFAULT_FONT_SIZE,
        fontFamily: DEFAULT_FONT_FAMILY,
        lineHeight: DEFAULT_LINE_HEIGHT,
        disguiseTheme: 'dark',
        stealthEnabled: true,
        hideShortcut: DEFAULT_HIDE_SHORTCUT,
        autoSaveInterval: AUTO_SAVE_INTERVAL
      })
    })

    it('should return updated settings after font size change', () => {
      manager.setFontSize(24)
      const settings = manager.getSettings()
      expect(settings.fontSize).toBe(24)
      expect(settings.fontFamily).toBe(DEFAULT_FONT_FAMILY)
    })

    it('should return updated settings after font family change', () => {
      manager.setFontFamily('Georgia, serif')
      const settings = manager.getSettings()
      expect(settings.fontFamily).toBe('Georgia, serif')
      expect(settings.fontSize).toBe(DEFAULT_FONT_SIZE)
    })

    it('should reflect both font size and family changes', () => {
      manager.setFontSize(20)
      manager.setFontFamily('Menlo, monospace')
      const settings = manager.getSettings()
      expect(settings.fontSize).toBe(20)
      expect(settings.fontFamily).toBe('Menlo, monospace')
    })

    it('should not lose other settings when updating font', () => {
      // Simulate pre-existing settings in store
      mockStore.set('settings', {
        fontSize: 18,
        fontFamily: 'Arial',
        lineHeight: 2,
        disguiseTheme: 'paper',
        stealthEnabled: false,
        hideShortcut: 'CommandOrControl+H',
        autoSaveInterval: 60000
      })

      manager.setFontSize(22)
      const settings = manager.getSettings()
      expect(settings.lineHeight).toBe(2)
      expect(settings.disguiseTheme).toBe('paper')
      expect(settings.stealthEnabled).toBe(false)
      expect(settings.hideShortcut).toBe('CommandOrControl+H')
      expect(settings.autoSaveInterval).toBe(60000)
    })
  })
})
