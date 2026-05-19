# Requirements Document

## Introduction

"隐蔽小说阅读器"是一款专为办公场景设计的小说阅读应用。该应用具备高度隐蔽性，当鼠标移出阅读区域时自动隐藏界面，支持导入 TXT 格式小说文件，能够自动识别并划分章节，并提供书架功能方便用户管理多本小说。

## Glossary

- **Reader**: 小说阅读器应用主体，负责展示小说内容和处理用户交互
- **Stealth_Mode**: 隐蔽模式，当鼠标移出阅读区域时自动隐藏阅读界面的功能
- **File_Importer**: 文件导入模块，负责读取和解析 TXT 格式的小说文件
- **Chapter_Parser**: 章节解析器，负责自动识别和划分小说章节
- **Bookshelf**: 书架模块，负责管理用户导入的所有小说及其阅读进度
- **Reading_Area**: 阅读区域，用户阅读小说内容的可视界面区域
- **Reading_Progress**: 阅读进度，记录用户在每本小说中的当前阅读位置

## Requirements

### Requirement 1: 隐蔽模式

**User Story:** As a 办公室用户, I want 阅读器在鼠标移出时自动隐藏, so that 我可以在工作时间隐蔽地阅读小说而不被发现。

#### Acceptance Criteria

1. WHEN 鼠标指针移出 Reading_Area 边界, THE Stealth_Mode SHALL 在 200ms 内将阅读界面设为不可见（窗口透明度降为 0 或窗口隐藏）
2. WHEN 鼠标指针移入 Reading_Area 所在屏幕位置, THE Stealth_Mode SHALL 在 200ms 内重新显示阅读界面，并恢复到隐藏前的阅读位置和状态
3. WHILE Stealth_Mode 处于隐藏状态, THE Reader SHALL 不在任务栏、系统托盘或屏幕上显示任何可见的阅读内容
4. THE Reader SHALL 提供至少一种伪装主题（如代码编辑器或终端窗口外观），使窗口标题、图标和内容区域的视觉呈现与所选伪装主题一致
5. WHEN 用户按下预设快捷键, THE Stealth_Mode SHALL 在 200ms 内隐藏阅读界面，行为与鼠标移出触发的隐藏一致
6. WHILE Stealth_Mode 从隐藏状态恢复为可见状态, THE Reader SHALL 保持用户的当前阅读章节和滚动位置不变

### Requirement 2: TXT 文件导入

**User Story:** As a 用户, I want 导入 TXT 格式的小说文件, so that 我可以阅读本地存储的小说。

#### Acceptance Criteria

1. WHEN 用户选择导入文件, THE File_Importer SHALL 打开文件选择器，仅允许选择 .txt 格式且大小不超过 50MB 的文件
2. WHEN 导入的 TXT 文件编码为 UTF-8 或 GBK, THE File_Importer SHALL 自动识别编码并将文件内容解析为可显示的文本，不出现乱码
3. IF 导入的文件格式不是 .txt, THEN THE File_Importer SHALL 显示错误提示信息，指示仅支持 .txt 格式
4. IF 导入的文件为空文件（大小为 0 字节）, THEN THE File_Importer SHALL 显示提示信息指示文件内容为空，且不将该文件添加到 Bookshelf
5. WHEN 文件导入成功, THE File_Importer SHALL 将小说添加到 Bookshelf 中，书名默认使用文件名（不含扩展名）
6. IF 导入的文件编码既不是 UTF-8 也不是 GBK, THEN THE File_Importer SHALL 显示错误提示信息，指示文件编码不支持，且不将该文件添加到 Bookshelf
7. IF 导入的文件大小超过 50MB, THEN THE File_Importer SHALL 显示提示信息指示文件过大，且不执行导入操作
8. WHEN 文件正在导入中, THE File_Importer SHALL 在 3 秒内完成不超过 10MB 文件的导入处理

### Requirement 3: 自动章节划分

**User Story:** As a 用户, I want 导入的小说自动划分章节, so that 我可以方便地按章节浏览和跳转阅读。

#### Acceptance Criteria

1. WHEN TXT 文件导入成功, THE Chapter_Parser SHALL 自动识别并划分章节
2. THE Chapter_Parser SHALL 识别以下章节标题模式：以"第"开头并包含"章"或"节"的行（如"第一章"、"第2章"、"第三节"）、以"Chapter"开头后跟数字或空格的行、以纯数字序号开头且后跟句点或空格再跟标题文字的行（如"1. 标题"、"1 标题"）
3. WHEN 章节划分完成, THE Chapter_Parser SHALL 生成章节目录，每个条目包含章节标题文本和该章节内容在文件中的起始字符偏移量
4. IF 文件中未识别到任何章节标题模式, THEN THE Chapter_Parser SHALL 按每 3000 字自动分段，并以"第 N 段"（N 从 1 开始递增）作为各段在章节目录中的标题
5. WHEN 用户在章节目录中选择某一章节, THE Reader SHALL 在 500 毫秒内跳转到该章节的起始位置并显示该章节内容
6. THE Chapter_Parser SHALL 在 3 秒内完成对 10MB 以内文件的章节解析
7. IF 文件中同时存在多种章节标题模式, THEN THE Chapter_Parser SHALL 统一识别所有匹配的模式并按其在文件中出现的顺序生成章节目录

### Requirement 4: 书架管理

**User Story:** As a 用户, I want 一个书架来管理我的所有小说, so that 我可以方便地切换和管理多本小说。

#### Acceptance Criteria

1. THE Bookshelf SHALL 以列表形式展示所有已导入的小说，每项包含书名和阅读进度（以百分比形式显示）
2. WHEN 用户从 Bookshelf 中选择一本小说, THE Reader SHALL 打开该小说并恢复到上次阅读位置
3. WHEN 用户请求删除 Bookshelf 中的一本小说, THE Bookshelf SHALL 显示确认提示，待用户确认后移除该小说及其阅读记录
4. WHEN 用户的阅读位置发生变化, THE Bookshelf SHALL 自动更新并持久化该小说的 Reading_Progress
5. WHEN Reader 关闭后重新打开, THE Bookshelf SHALL 恢复之前保存的所有小说和阅读进度数据
6. THE Bookshelf SHALL 显示每本小说的文件名（不含扩展名）作为默认书名，书名显示最大长度为 50 个字符，超出部分以省略号截断
7. WHEN 用户修改某本小说的书名, THE Bookshelf SHALL 保存用户自定义的书名，书名长度上限为 50 个字符
8. IF Bookshelf 中没有任何已导入的小说, THEN THE Bookshelf SHALL 显示空状态提示，引导用户导入小说

### Requirement 5: 阅读体验

**User Story:** As a 用户, I want 舒适的阅读体验, so that 我可以长时间阅读而不感到疲劳。

#### Acceptance Criteria

1. THE Reader SHALL 支持通过键盘方向键（上/下）进行逐页翻页，以及通过鼠标滚轮进行逐行滚动
2. THE Reader SHALL 以等宽字体作为默认字体展示小说内容，并允许用户从字体列表中选择其他字体
3. WHEN 用户调整字体大小, THE Reader SHALL 在 200 毫秒内更新阅读界面的字体大小，字体大小可调范围为 12px 至 48px，步长为 2px
4. THE Reader SHALL 在阅读界面底部显示当前阅读进度，以整数百分比（0%-100%）形式呈现
5. WHILE 用户正在阅读（阅读界面处于前台且未被其他窗口遮挡）, THE Reader SHALL 每 30 秒自动保存当前阅读位置
6. IF 自动保存阅读位置失败, THEN THE Reader SHALL 在界面中显示保存失败的提示信息，并在 30 秒后重试保存操作
