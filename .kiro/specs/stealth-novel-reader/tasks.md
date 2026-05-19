# Implementation Plan: 隐蔽小说阅读器 (Stealth Novel Reader)

## Overview

基于 Electron + React + TypeScript 构建隐蔽小说阅读器。实现按模块递进：先搭建项目骨架和核心接口，再逐步实现文件导入、章节解析、书架管理、阅读控制和隐蔽模式，最后集成联调。

## Tasks

- [ ] 1. 项目初始化与核心接口定义
  - [x] 1.1 初始化 Electron + React + TypeScript 项目结构
    - 使用 electron-vite 或类似脚手架创建项目
    - 配置 `package.json`，安装依赖：electron, react, react-dom, typescript, electron-store, chardet, iconv-lite
    - 创建目录结构：`src/main/`（主进程）、`src/renderer/`（渲染进程）、`src/shared/`（共享类型）
    - 配置 tsconfig.json、vite 配置
    - _Requirements: 全部_

  - [x] 1.2 定义共享类型和接口
    - 在 `src/shared/types.ts` 中定义所有接口：`BookMeta`, `BookData`, `ReadingProgress`, `Chapter`, `ImportResult`, `ImportError`, `AppSettings`, `StealthConfig`, `DisguiseTheme`
    - 在 `src/shared/constants.ts` 中定义常量：文件大小限制(50MB)、字体大小范围(12-48)、步长(2)、自动保存间隔(30s)、章节分段长度(3000)
    - 在 `src/shared/ipc-channels.ts` 中定义 IPC 通道名称常量
    - _Requirements: 1.1-1.6, 2.1-2.8, 3.1-3.7, 4.1-4.8, 5.1-5.6_

  - [x] 1.3 配置测试框架
    - 安装 vitest、fast-check、@testing-library/react
    - 配置 `vitest.config.ts`，设置测试环境
    - 创建测试目录结构：`tests/unit/`、`tests/property/`
    - _Requirements: 全部_

- [ ] 2. 文件导入模块实现
  - [x] 2.1 实现文件验证逻辑
    - 在 `src/main/file-importer.ts` 中实现 `FileImporter` 类
    - 实现文件格式验证：检查扩展名是否为 `.txt`（不区分大小写）
    - 实现文件大小验证：检查是否超过 50MB
    - 实现空文件验证：检查文件大小是否为 0
    - 返回对应的 `ImportError` 错误码
    - _Requirements: 2.1, 2.3, 2.4, 2.7_

  - [ ]* 2.2 编写文件验证属性测试
    - **Property 3: 非 TXT 文件拒绝**
    - **Validates: Requirements 2.3**

  - [x] 2.3 实现编码检测与文件读取
    - 使用 chardet 检测文件编码
    - 支持 UTF-8 和 GBK 编码识别
    - 使用 iconv-lite 对 GBK 文件进行解码
    - 对不支持的编码返回 `UNSUPPORTED_ENCODING` 错误
    - _Requirements: 2.2, 2.6_

  - [ ]* 2.4 编写编码检测属性测试
    - **Property 2: 编码检测与解码 Round-Trip**
    - **Validates: Requirements 2.2**

  - [x] 2.5 实现文件导入完整流程
    - 实现 `importFile()` 方法：打开文件对话框（过滤 .txt）→ 验证 → 编码检测 → 读取内容 → 构建 BookData
    - 文件名提取：去除 `.txt` 扩展名作为默认书名
    - 注册 IPC handler：`file:import`
    - _Requirements: 2.1, 2.5, 2.8_

  - [ ]* 2.6 编写文件名到书名提取属性测试
    - **Property 4: 文件名到书名提取**
    - **Validates: Requirements 2.5**

- [ ] 3. 章节解析模块实现
  - [x] 3.1 实现章节标题模式匹配
    - 在 `src/main/chapter-parser.ts` 中实现 `ChapterParser` 类
    - 实现正则匹配：`/^第[一二三四五六七八九十百千万零\d]+[章节]/m`、`/^Chapter\s*\d+/im`、`/^\d+[.\s]+\S+/m`
    - 扫描文本逐行匹配，记录每个匹配的行偏移量
    - _Requirements: 3.1, 3.2, 3.7_

  - [ ]* 3.2 编写章节标题模式识别属性测试
    - **Property 5: 章节标题模式识别**
    - **Validates: Requirements 3.2**

  - [x] 3.3 实现章节目录生成
    - 根据匹配结果生成 `Chapter[]` 数组，包含 title、offset、length
    - 确保章节按 offset 严格递增排列
    - 计算每个章节的 length（到下一章节起始位置或文件末尾）
    - _Requirements: 3.3, 3.7_

  - [ ]* 3.4 编写章节偏移量正确性属性测试
    - **Property 6: 章节偏移量正确性与顺序**
    - **Validates: Requirements 3.3, 3.7**

  - [x] 3.5 实现无章节标记时的自动分段
    - 当未识别到任何章节标题时，按每 3000 字符分段
    - 生成标题格式："第 N 段"（N 从 1 递增）
    - 确保所有段拼接后等于原始文本
    - _Requirements: 3.4_

  - [ ]* 3.6 编写无章节标记分段属性测试
    - **Property 7: 无章节标记时的等分分段**
    - **Validates: Requirements 3.4**

- [ ] 4. Checkpoint - 核心解析逻辑验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. 书架管理模块实现
  - [x] 5.1 实现书架数据持久化
    - 在 `src/main/bookshelf-manager.ts` 中实现 `BookshelfManager` 类
    - 使用 electron-store 存储 `BookMeta[]` 和文件内容
    - 实现大文件（>5MB）独立文件存储策略
    - 实现 `getAllBooks()`、`addBook()`、`removeBook()` 方法
    - _Requirements: 4.1, 4.4, 4.5_

  - [ ]* 5.2 编写书架数据持久化属性测试
    - **Property 8: 书架数据持久化 Round-Trip**
    - **Validates: Requirements 4.2, 4.4, 4.5**

  - [x] 5.3 实现阅读进度管理
    - 实现 `updateProgress()` 和 `getProgress()` 方法
    - 阅读进度包含：chapterIndex、scrollPosition、percentage
    - 进度变化时自动持久化
    - _Requirements: 4.2, 4.4_

  - [x] 5.4 实现书名管理
    - 实现 `updateTitle()` 方法
    - 书名长度限制：最大 50 字符，超出截断并附加省略号
    - _Requirements: 4.6, 4.7_

  - [ ]* 5.5 编写书籍删除完整性属性测试
    - **Property 9: 书籍删除完整性**
    - **Validates: Requirements 4.3**

  - [ ]* 5.6 编写书名长度验证属性测试
    - **Property 10: 书名长度验证**
    - **Validates: Requirements 4.6, 4.7**

  - [x] 5.7 注册书架相关 IPC handlers
    - 注册 `bookshelf:getAll`、`bookshelf:remove`、`bookshelf:updateProgress`、`bookshelf:updateTitle`、`reader:getContent`
    - _Requirements: 4.1-4.8_

- [ ] 6. 阅读控制器实现
  - [x] 6.1 实现阅读控制器核心逻辑
    - 在 `src/main/reader-controller.ts` 中实现 `ReaderController` 类
    - 实现 `openBook()`：加载书籍内容并恢复阅读进度
    - 实现 `goToChapter()`：跳转到指定章节
    - 实现阅读百分比计算：`Math.round(position / totalLength * 100)`，确保结果在 [0, 100] 范围内
    - _Requirements: 3.5, 4.2, 5.4_

  - [ ]* 6.2 编写阅读进度百分比属性测试
    - **Property 12: 阅读进度百分比计算**
    - **Validates: Requirements 5.4**

  - [x] 6.3 实现字体设置逻辑
    - 实现 `setFontSize()`：约束范围 [12, 48]，步长 2px
    - 实现 `setFontFamily()`：设置字体，默认等宽字体 "Consolas, monospace"
    - 持久化字体设置到 electron-store
    - _Requirements: 5.2, 5.3_

  - [ ]* 6.4 编写字体大小范围属性测试
    - **Property 11: 字体大小范围与步长验证**
    - **Validates: Requirements 5.3**

  - [x] 6.5 实现自动保存机制
    - 实现 `startAutoSave()`：每 30 秒保存当前阅读位置
    - 实现 `stopAutoSave()`：停止定时器
    - 保存失败时通过 IPC 发送 `autosave:failed` 事件
    - 失败后 30 秒重试，连续 3 次失败后停止
    - _Requirements: 5.5, 5.6_

- [ ] 7. Checkpoint - 后端逻辑完整验证
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. 隐蔽模式实现
  - [x] 8.1 实现窗口隐藏/显示控制
    - 在 `src/main/stealth-mode-manager.ts` 中实现 `StealthModeManager` 类
    - 实现 `hide()`：使用 `win.setOpacity(0)` + `win.setSkipTaskbar(true)` 在 200ms 内隐藏
    - 实现 `show()`：恢复 opacity 和 taskbar 显示
    - 保存隐藏前的阅读状态（章节索引、滚动位置）
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [ ]* 8.2 编写 Hide/Show 状态保持属性测试
    - **Property 1: Hide/Show 状态保持**
    - **Validates: Requirements 1.2, 1.6**

  - [x] 8.3 实现鼠标移出检测
    - 监听窗口的 `mouse-leave` 事件
    - 鼠标移出时触发 `hide()`
    - 鼠标移入窗口区域时触发 `show()`
    - _Requirements: 1.1, 1.2_

  - [x] 8.4 实现快捷键隐藏
    - 使用 `globalShortcut.register()` 注册快捷键（默认 `CommandOrControl+Shift+H`）
    - 快捷键触发时执行与鼠标移出相同的隐藏逻辑
    - _Requirements: 1.5_

  - [x] 8.5 实现伪装主题
    - 实现 `setDisguise()` 方法
    - 支持 'code-editor' 和 'terminal' 两种主题
    - 修改窗口标题、图标以匹配伪装主题
    - 注册 IPC handler：`stealth:setDisguise`、`stealth:hide`
    - _Requirements: 1.4_

- [ ] 9. 渲染进程 UI 实现
  - [x] 9.1 实现书架视图组件
    - 在 `src/renderer/components/BookshelfView.tsx` 中实现书架列表
    - 显示书名（最长 50 字符，超出省略号截断）和阅读进度百分比
    - 实现空状态提示：引导用户导入小说
    - 实现删除确认对话框
    - 实现书名编辑功能
    - _Requirements: 4.1, 4.3, 4.6, 4.7, 4.8_

  - [x] 9.2 实现阅读视图组件
    - 在 `src/renderer/components/ReaderView.tsx` 中实现阅读界面
    - 实现键盘方向键翻页（上/下）和鼠标滚轮逐行滚动
    - 底部显示阅读进度百分比
    - 实现字体大小调整 UI（12-48px，步长 2px）
    - 实现字体选择 UI
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 9.3 实现章节目录侧边栏
    - 在 `src/renderer/components/ChapterList.tsx` 中实现章节目录
    - 点击章节条目跳转到对应位置
    - 高亮当前阅读章节
    - _Requirements: 3.5_

  - [x] 9.4 实现伪装主题 UI
    - 在 `src/renderer/components/DisguiseTheme.tsx` 中实现主题切换
    - 实现 'code-editor' 主题：模拟代码编辑器外观（行号、语法高亮色调）
    - 实现 'terminal' 主题：模拟终端窗口外观（黑底绿字）
    - _Requirements: 1.4_

  - [x] 9.5 实现导入文件交互和错误提示
    - 实现导入按钮，调用 `file:import` IPC
    - 根据 ImportError 显示对应错误提示信息
    - 实现自动保存失败的 toast 提示
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 2.7, 5.6_

- [ ] 10. 主进程入口与窗口配置
  - [x] 10.1 实现主进程入口文件
    - 在 `src/main/index.ts` 中创建 BrowserWindow
    - 配置窗口属性：transparent、frame: false、skipTaskbar 支持
    - 初始化所有模块：StealthModeManager、FileImporter、ChapterParser、BookshelfManager、ReaderController
    - 注册所有 IPC handlers
    - 配置应用退出时的清理逻辑
    - _Requirements: 1.1-1.6, 全部_

- [ ] 11. 集成联调与最终验证
  - [x] 11.1 集成文件导入到书架完整流程
    - 连接 FileImporter → ChapterParser → BookshelfManager 完整链路
    - 验证导入文件后自动解析章节并添加到书架
    - 验证打开书籍时恢复阅读进度
    - _Requirements: 2.1-2.8, 3.1-3.7, 4.1-4.5_

  - [ ]* 11.2 编写集成测试
    - 测试文件导入完整流程
    - 测试自动保存触发
    - 测试隐蔽模式切换
    - _Requirements: 1.1-1.6, 2.1-2.8, 5.5-5.6_

- [ ] 12. Final Checkpoint - 全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- 技术栈：Electron + React + TypeScript + electron-store + chardet + iconv-lite
- 测试框架：Vitest + fast-check + @testing-library/react

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1", "5.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2", "3.3", "5.3", "5.4"] },
    { "id": 4, "tasks": ["2.4", "2.5", "3.4", "3.5", "5.5", "5.6", "5.7"] },
    { "id": 5, "tasks": ["2.6", "3.6", "5.2", "6.1", "8.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.5", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 7, "tasks": ["6.4", "9.1", "9.2", "9.3", "9.4", "9.5"] },
    { "id": 8, "tasks": ["10.1"] },
    { "id": 9, "tasks": ["11.1"] },
    { "id": 10, "tasks": ["11.2"] }
  ]
}
```
