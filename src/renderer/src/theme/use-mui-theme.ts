import { useMemo } from 'react'
import { createTheme, type Theme } from '@mui/material/styles'
import type { DisguiseTheme } from '../../../shared/types'
import { createMuiTheme } from './mui-theme'

/**
 * 按伪装主题缓存 MUI 主题。
 *
 * createTheme 会做颜色派生与组件默认值合并，属于纯计算但不算便宜；
 * 阅读时每次滚动、每次改字号都会重渲染 App，若每次新建主题会白白浪费。
 * 用 Map 缓存后，同一主题只构建一次。
 */
const cache = new Map<DisguiseTheme, Theme>()

export function useMuiTheme(disguise: DisguiseTheme): Theme {
  return useMemo(() => {
    const cached = cache.get(disguise)
    if (cached) return cached

    const theme = createMuiTheme(disguise)
    cache.set(disguise, theme)
    return theme
  }, [disguise])
}

/** 测试用：清空缓存，避免用例之间互相影响。 */
export function __clearMuiThemeCache(): void {
  cache.clear()
}

// 供需要直接构造主题的场景（如测试）使用。
export { createTheme }
