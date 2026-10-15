// 应用常量定义

/** 文件大小限制：50MB（字节） */
export const MAX_FILE_SIZE = 50 * 1024 * 1024

/** 字体大小最小值（px） */
export const FONT_SIZE_MIN = 12

/** 字体大小最大值（px） */
export const FONT_SIZE_MAX = 48

/** 字体大小调整步长（px） */
export const FONT_SIZE_STEP = 2

/** 自动保存间隔（ms） */
export const AUTO_SAVE_INTERVAL = 30 * 1000

/** 无章节标记时的分段长度（字符数） */
export const CHAPTER_SEGMENT_LENGTH = 3000

/** 书名最大长度（字符数） */
export const MAX_TITLE_LENGTH = 50

/** 隐藏/显示动画时长（ms） */
export const STEALTH_ANIMATION_DURATION = 200

/** 默认字体大小（px） */
export const DEFAULT_FONT_SIZE = 17

/**
 * 默认字体。
 *
 * 之前默认是 'Consolas, monospace'——用等宽代码字体渲染中文正文，字重和字宽
 * 都不适合长文阅读。默认改为中文衬线阅读字体，等宽字体仍可在设置里主动选择
 * （伪装成代码编辑器时才有意义）。
 */
export const DEFAULT_FONT_FAMILY =
  '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", SimSun, serif'

/** Renderer 中允许选择并持久化的字体 */
export const ALLOWED_FONT_FAMILIES = [
  DEFAULT_FONT_FAMILY,
  '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
  '"Heiti SC", "Microsoft YaHei", sans-serif',
  'Georgia, "Times New Roman", serif',
  'Consolas, monospace',
  '"Source Code Pro", monospace',
  'Monaco, monospace',
  'monospace'
] as const

/** 默认行间距 */
export const DEFAULT_LINE_HEIGHT = 1.9

/** 行间距范围 */
export const LINE_HEIGHT_MIN = 1.0
export const LINE_HEIGHT_MAX = 3.6
export const LINE_HEIGHT_STEP = 0.2

/** 默认隐藏快捷键 */
export const DEFAULT_HIDE_SHORTCUT = 'CommandOrControl+Shift+H'

/**
 * 默认鼠标移出后的处理方式。
 *
 * 之前默认是 'deferred-quit'（隐藏后 5 秒自动退出应用）：用户去接杯水回来，
 * 应用已经没了，未落盘的阅读位置也随之丢失。一个阅读工具的默认行为应该是
 * 「藏起来」而不是「杀掉自己」，需要自动退出的用户可以在设置里主动开启。
 */
export const DEFAULT_MOUSE_LEAVE_ACTION = 'hide' as const

/** 鼠标移出后给用户返回窗口的缓冲时间（ms）；延长以降低误触退出风险 */
export const DEFAULT_MOUSE_LEAVE_QUIT_DELAY = 5000

/** 鼠标移出延迟的最小值（ms）；0 表示离开后立即执行 */
export const MOUSE_LEAVE_DELAY_MIN = 0

/** 鼠标移出延迟的最大值（ms） */
export const MOUSE_LEAVE_DELAY_MAX = 15000

/** 鼠标移出延迟的调整步长（ms） */
export const MOUSE_LEAVE_DELAY_STEP = 1000

/** 鼠标回到隐藏位置后，恢复窗口前的停留时间（ms） */
export const DEFAULT_MOUSE_RETURN_DELAY = 2000

/** 显形延迟的最小值（ms） */
export const MOUSE_RETURN_DELAY_MIN = 0

/** 显形延迟的最大值（ms） */
export const MOUSE_RETURN_DELAY_MAX = 15000

/** 显形延迟的调整步长（ms） */
export const MOUSE_RETURN_DELAY_STEP = 1000

/** 自动保存连续失败多少次后转入低频退避模式 */
export const MAX_AUTO_SAVE_RETRIES = 3

/**
 * 退避后的自动保存间隔（ms）。
 *
 * 旧实现在连续失败 MAX_AUTO_SAVE_RETRIES 次后直接 stopAutoSave()：磁盘短暂
 * 写满一次，用户之后读几小时的进度就再也不会保存，且界面上只弹过一次 toast。
 * 现在改为降频重试，保证异常恢复后进度仍能落盘。
 */
export const AUTO_SAVE_BACKOFF_INTERVAL = 5 * 60 * 1000
