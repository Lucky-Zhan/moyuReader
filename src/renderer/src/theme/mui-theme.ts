import { createTheme, type Theme } from '@mui/material/styles'
import type { DisguiseTheme } from '../../../shared/types'

/**
 * MUI 主题工厂：为每套伪装主题生成一个真实的 MUI 主题。
 *
 * 为什么不能用 CSS 变量桥接：
 * MUI 在构建主题时要对颜色做派生计算（hover / disabled / contrastText），
 * 传 `var(--accent)` 会直接抛
 * 「MUI: Unsupported `var(--accent)` color」。因此只能把真实色值喂给 MUI。
 *
 * 色值必须与 DisguiseTheme.css 的 .theme-* 保持一致——两边不同步会让
 * MUI 组件（对话框、菜单、Snackbar）与其余界面出现色差。
 * 下方 THEME_PALETTES 是唯一数据源，测试会校验它与 CSS 不漂移。
 */

interface Palette {
  appBg: string
  panelBg: string
  text: string
  muted: string
  border: string
  accent: string
  danger: string
  hoverBg: string
  activeBg: string
  activeText: string
  /** code / terminal 伪装下正文是「代码」「日志」，必须等宽 */
  mono: boolean
  mode: 'light' | 'dark'
}

export const THEME_PALETTES: Record<DisguiseTheme, Palette> = {
  dark: {
    appBg: '#1c1c1e',
    panelBg: '#242426',
    text: '#e3e3e6',
    muted: '#98989f',
    border: '#38383c',
    accent: '#5b9dff',
    danger: '#ff6961',
    hoverBg: '#2c2c30',
    activeBg: '#2f3d55',
    activeText: '#ffffff',
    mono: false,
    mode: 'dark'
  },
  light: {
    appBg: '#faf9fe',
    panelBg: '#f4f3f8',
    text: '#1a1b1f',
    muted: '#5f6466',
    border: '#c3c7c8',
    accent: '#3a6752',
    danger: '#ba1a1a',
    hoverBg: '#e9e7ed',
    activeBg: '#bceed3',
    activeText: '#214f3b',
    mono: false,
    mode: 'light'
  },
  paper: {
    appBg: '#f5eedf',
    panelBg: '#eee2ca',
    text: '#2f261b',
    muted: '#76664d',
    border: '#d8c7a8',
    accent: '#9f6b25',
    danger: '#9a3412',
    hoverBg: '#eadfc8',
    activeBg: '#d9b56f',
    activeText: '#2f261b',
    mono: false,
    mode: 'light'
  },
  code: {
    appBg: '#1f1f23',
    panelBg: '#26262b',
    text: '#d4d4d4',
    muted: '#8a8a94',
    border: '#34343c',
    accent: '#3794ff',
    danger: '#f48771',
    hoverBg: '#2d2d35',
    activeBg: '#0b3a5c',
    activeText: '#ffffff',
    mono: true,
    mode: 'dark'
  },
  terminal: {
    appBg: '#050505',
    panelBg: '#0b0b0b',
    text: '#33ff66',
    muted: '#168f34',
    border: '#145c24',
    accent: '#33ff66',
    danger: '#ff5c57',
    hoverBg: '#0f1f12',
    activeBg: '#113d1b',
    activeText: '#d6ffd9',
    mono: true,
    mode: 'dark'
  }
}

const UI_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
const MONO_FONT = '"SF Mono", "JetBrains Mono", Consolas, Monaco, "Courier New", monospace'

/**
 * 生成某套伪装主题对应的 MUI 主题。
 *
 * 刻意不启用 cssVariables：该模式要求 MUI 自己管理变量作用域，会与本项目
 * .theme-* 的变量体系互相覆盖（实测桥接层被 MUI 注入的默认色 #1976d2 压掉）。
 * 直接生成真实主题更可靠，代价是切换主题时要重建（见 useMuiTheme）。
 */
export function createMuiTheme(disguise: DisguiseTheme): Theme {
  const p = THEME_PALETTES[disguise]

  return createTheme({
    palette: {
      mode: p.mode,
      primary: { main: p.accent, contrastText: p.activeText },
      error: { main: p.danger },
      background: { default: p.appBg, paper: p.panelBg },
      text: { primary: p.text, secondary: p.muted },
      divider: p.border,
      action: {
        hover: p.hoverBg,
        selected: p.activeBg,
        active: p.text
      }
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: p.mono ? MONO_FONT : UI_FONT,
      fontSize: 15,
      button: { textTransform: 'none', fontWeight: 500 }
    },
    components: {
      MuiButtonBase: {
        defaultProps: { disableRipple: true }
      },
      MuiPaper: {
        styleOverrides: {
          // MUI 默认给 Paper 叠一层渐变，会盖掉伪装主题的纯色表面。
          root: { backgroundImage: 'none' }
        }
      }
    }
  })
}
