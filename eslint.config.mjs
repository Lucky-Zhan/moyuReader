import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

/**
 * ESLint 扁平配置。
 *
 * 目标不是「风格洁癖」，而是补上 typecheck 查不到的那一类问题：
 * - 未使用的变量与导入（tsconfig 未开 noUnusedLocals）
 * - React hooks 依赖数组错误（本项目有大量 ref/effect 交互，最容易出错）
 * - 误用 `any`、浮空 Promise 等
 *
 * 风格规则只保留代码库既有约定（2 空格缩进、单引号、行尾无分号），
 * 不引入 Prettier，避免与现有格式大面积冲突。
 */

const CODE_STYLE = {
  indent: ['error', 2, { SwitchCase: 1 }],
  quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
  semi: ['error', 'never'],
  'comma-dangle': ['error', 'never'],
  'object-curly-spacing': ['error', 'always'],
  'eol-last': ['error', 'always'],
  'no-trailing-spaces': 'error',
  'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }]
}

const CORRECTNESS = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  'no-console': 'off',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'prefer-const': 'error',
  'no-var': 'error'
}

export default tseslint.config(
  {
    // 构建产物、依赖、打包输出不参与检查。
    // .understand-anything 是代码知识图谱工具的生成缓存（已在 .gitignore 中）。
    ignores: [
      'out/**',
      'release/**',
      'dist/**',
      'node_modules/**',
      '.understand-anything/**',
      '**/*.d.ts'
    ]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 主进程 / preload：Node 环境
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: { ...CODE_STYLE, ...CORRECTNESS }
  },

  // 构建脚本：纯 JS，不属于任何 tsconfig，因此不启用类型感知规则。
  {
    files: ['scripts/**/*.{mjs,js}'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module'
    },
    rules: {
      ...CODE_STYLE,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },

  // electron-builder 钩子是 CommonJS（.cjs），必须按 script 解析。
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs'
    },
    rules: {
      ...CODE_STYLE,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },

  // 渲染进程：浏览器环境 + React
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...CODE_STYLE,
      ...CORRECTNESS,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // 本项目存在两类**有意为之**、但会被这两条规则命中的模式。
      // 降级为 warn 而不是 off：新代码仍然会被提示，但不会卡住 CI。
      //
      // 1) set-state-in-effect：ReaderView 把 App 持有的设置（字号/字体/行距）
      //    同步进本地 state，属于「props -> state 镜像」。React 官方推荐用
      //    key 重建或受控组件替代，但这里改动面太大且收益有限。
      // 2) exhaustive-deps：多处 effect 故意只依赖 ref/稳定标识，
      //    补全依赖会导致滚动过程中反复重跑。
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  // 测试：允许较宽松的写法
  {
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      ...CODE_STYLE,
      ...CORRECTNESS,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 测试里大量使用 `as any` 构造不完整对象，浮空 Promise 也常见。
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off'
    }
  },

  // 配置文件本身
  {
    files: ['*.config.{ts,js,mjs}', 'electron.vite.config.ts', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { ...CODE_STYLE }
  }
)
