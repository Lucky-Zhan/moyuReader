import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * 路径别名此前只配在 tsconfig 与 vitest 里，没有接到 electron-vite 上，
 * 因此源码只能用 ../../../shared/... 这类相对路径。这里补齐，让三处一致。
 */
const sharedAlias = {
  '@shared': resolve(__dirname, 'src/shared')
}
const rendererAlias = {
  ...sharedAlias,
  '@renderer': resolve(__dirname, 'src/renderer/src')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: sharedAlias
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: rendererAlias,
      // 确保 React 与 MUI/Emotion 解析到同一份实例。
      // 缺少 dedupe 时 dev 预打包会把 React 拆进不同 chunk，
      // 运行时出现「Invalid hook call / 多个 React 副本」并白屏。
      dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled']
    },
    optimizeDeps: {
      // 让 Vite 把 React 与 MUI/Emotion 一起预打包，避免各自内联一份 React。
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        '@emotion/react',
        '@emotion/styled',
        '@mui/material',
        '@mui/material/styles'
      ]
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
