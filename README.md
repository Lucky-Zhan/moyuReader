# MoyuReader · 隐蔽小说阅读器

一个为办公场景设计的桌面小说阅读器：鼠标移出窗口即自动隐藏，界面可伪装成代码编辑器或终端，让你在工位上看小说不被发现。

> 摸鱼有风险，请遵守所在公司的规章制度 🙂

## 功能

- **隐蔽模式** — 鼠标移出窗口后按配置延迟隐藏，移回原位自动恢复，并保持隐藏前的章节与滚动位置。支持全局快捷键（默认 `Cmd/Ctrl+Shift+H`）手动隐藏。
- **伪装主题** — 深色 / 浅色 / 纸张 / 代码 / 终端五种配色，代码与终端主题下会同时改写窗口标题与正文排版，避免被一眼看出是小说。
- **TXT 导入** — 自动识别 UTF-8 / GBK（含 GB2312、GB18030）编码，支持批量导入，单文件上限 50MB。
- **自动章节划分** — 识别 `第X章`、`第X节`、`第X卷`、`Chapter N`、`1. 标题` 等常见格式；识别不到章节时按每 3000 字自动分段。
- **书架管理** — 阅读进度、书名重命名、书签、全书搜索、备份导出与恢复。

## 技术栈

Electron 41 · React 18 · TypeScript 5 · electron-vite · electron-builder · Vitest

## 开发

```bash
npm install
npm run dev          # 启动开发模式
npm run typecheck    # 类型检查（main + renderer）
npm test             # 运行测试
npm run verify       # typecheck + test + build
```

## 打包

```bash
npm run pack         # 生成未打包的目录（release/）
npm run dist:mac     # macOS dmg + zip
npm run dist:win     # Windows nsis + portable
npm run dist:linux   # Linux AppImage + deb
```

## 架构

```
src/
  main/        主进程：窗口与隐蔽模式、文件导入、章节解析、书架持久化
  preload/     预加载脚本：通过 contextBridge 暴露白名单 API
  renderer/    React 界面：书架、阅读器、目录抽屉、设置面板
  shared/      主进程与渲染进程共享的类型、常量与规则
```

**进程边界**：窗口的隐藏/显示必须由主进程执行，因此隐蔽逻辑全部在 `src/main/stealth-mode-manager.ts`；渲染进程通过 `preload` 暴露的 `window.api` 调用固定 IPC 通道，不暴露任意 `invoke`/`on` 能力。

**数据存储**：书架元数据、阅读进度与书签存在 `electron-store`；**小说正文一律存为独立文件**（`userData/books/<bookId>.txt`），避免每次导入都把全部书籍的正文重新序列化。

## 设计文档

需求、设计与实施计划见 `.kiro/specs/stealth-novel-reader/`：

- `requirements.md` — 5 大需求与验收标准（含 200ms 内隐藏、10MB 文件 3 秒内解析等指标）
- `design.md` — 架构图与技术选型理由
- `tasks.md` — 分模块实施计划

## 许可

[MIT](./LICENSE)
