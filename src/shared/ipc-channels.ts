// IPC 通道名称常量

/** Renderer -> Main 调用通道 */
export const IPC_CHANNELS = {
  /** 文件导入 */
  FILE_IMPORT: 'file:import',

  /** 获取所有书籍 */
  BOOKSHELF_GET_ALL: 'bookshelf:getAll',

  /** 删除书籍 */
  BOOKSHELF_REMOVE: 'bookshelf:remove',

  /** 更新阅读进度 */
  BOOKSHELF_UPDATE_PROGRESS: 'bookshelf:updateProgress',

  /** 获取阅读进度 */
  BOOKSHELF_GET_PROGRESS: 'bookshelf:getProgress',

  /** 更新书名 */
  BOOKSHELF_UPDATE_TITLE: 'bookshelf:updateTitle',

  /** 获取书籍内容 */
  READER_GET_CONTENT: 'reader:getContent',

  /** 设置伪装主题 */
  STEALTH_SET_DISGUISE: 'stealth:setDisguise',

  /** 隐藏窗口 */
  STEALTH_HIDE: 'stealth:hide',

  /** 设置字体大小 */
  SETTINGS_SET_FONT_SIZE: 'settings:setFontSize',

  /** 设置字体 */
  SETTINGS_SET_FONT_FAMILY: 'settings:setFontFamily',

  /** 设置行间距 */
  SETTINGS_SET_LINE_HEIGHT: 'settings:setLineHeight',

  /** 获取完整应用设置 */
  SETTINGS_GET: 'settings:get',

  /** 设置伪装主题 */
  SETTINGS_SET_DISGUISE_THEME: 'settings:setDisguiseTheme',

  /** 设置隐蔽模式开关 */
  SETTINGS_SET_STEALTH_ENABLED: 'settings:setStealthEnabled',

  /** 鼠标移出窗口区域（渲染进程 -> 主进程） */
  STEALTH_MOUSE_LEAVE: 'stealth:mouseLeave',

  /** 鼠标移入窗口区域（渲染进程 -> 主进程） */
  STEALTH_MOUSE_ENTER: 'stealth:mouseEnter',
} as const;

/** Main -> Renderer 事件通道 */
export const IPC_EVENTS = {
  /** 窗口已隐藏 */
  STEALTH_HIDDEN: 'stealth:hidden',

  /** 窗口已显示 */
  STEALTH_SHOWN: 'stealth:shown',

  /** 自动保存失败 */
  AUTOSAVE_FAILED: 'autosave:failed',
} as const;
