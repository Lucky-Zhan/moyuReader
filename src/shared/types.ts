// 共享类型定义

/** 编码类型 */
export type EncodingType = 'utf-8' | 'gbk';

/** 阅读配色主题类型 */
export type DisguiseTheme = 'dark' | 'light' | 'paper';

/** 隐蔽模式配置 */
export interface StealthConfig {
  /** 快捷键，默认 "CommandOrControl+Shift+H" */
  hideShortcut: string;
  /** 鼠标移出后延迟隐藏时间（ms），默认 0 */
  mouseLeaveDelay: number;
  /** 隐藏方式 */
  hideAnimation: 'opacity' | 'hide';
}

/** 章节信息 */
export interface Chapter {
  /** 章节标题 */
  title: string;
  /** 条目类型 */
  type?: 'volume' | 'chapter' | 'section';
  /** 起始字符偏移量 */
  offset: number;
  /** 章节内容长度（字符数） */
  length: number;
}

/** 书籍元数据 */
export interface BookMeta {
  /** 唯一标识（UUID） */
  id: string;
  /** 书名（最长 50 字符） */
  title: string;
  /** 文件路径 */
  filePath: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** 章节目录 */
  chapters: Chapter[];
  /** 添加时间戳 */
  addedAt: number;
  /** 最后阅读时间戳 */
  lastReadAt: number;
}

/** 书籍数据（导入时使用） */
export interface BookData {
  /** 文件名（不含扩展名） */
  fileName: string;
  /** 文件完整路径 */
  filePath: string;
  /** 文件文本内容 */
  content: string;
  /** 文件大小 */
  fileSize: number;
  /** 检测到的编码 */
  encoding: EncodingType;
}

/** 阅读进度 */
export interface ReadingProgress {
  /** 当前章节索引 */
  chapterIndex: number;
  /** 滚动位置（像素） */
  scrollPosition: number;
  /** 阅读百分比（0-100 整数） */
  percentage: number;
}

/** 导入结果 */
export interface ImportResult {
  success: boolean;
  book?: BookData;
  error?: ImportError;
}

/** 导入错误 */
export interface ImportError {
  code: 'INVALID_FORMAT' | 'EMPTY_FILE' | 'UNSUPPORTED_ENCODING' | 'FILE_TOO_LARGE';
  message: string;
}

/** 应用设置 */
export interface AppSettings {
  /** 字体大小，默认 16px */
  fontSize: number;
  /** 字体，默认 "Consolas, monospace" */
  fontFamily: string;
  /** 行间距，默认 1.8 */
  lineHeight: number;
  /** 阅读配色主题，默认 'dark' */
  disguiseTheme: DisguiseTheme;
  /** 是否启用隐蔽模式，默认 true */
  stealthEnabled: boolean;
  /** 隐藏快捷键 */
  hideShortcut: string;
  /** 自动保存间隔（ms），默认 30000 */
  autoSaveInterval: number;
}
