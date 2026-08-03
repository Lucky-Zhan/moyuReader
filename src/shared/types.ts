// 共享类型定义

/** 编码类型 */
export type EncodingType = 'utf-8' | 'gbk';

/** 阅读配色/伪装主题类型 */
export type DisguiseTheme = 'dark' | 'light' | 'paper' | 'code' | 'terminal';

/** 隐蔽模式配置 */
export interface StealthConfig {
  /** 快捷键，默认 "CommandOrControl+Shift+H" */
  hideShortcut: string;
  /** 鼠标移出后的处理方式，默认隐藏窗口 */
  mouseLeaveAction?: 'hide' | 'quit' | 'deferred-quit';
  /** 鼠标移出后的延迟时间（ms）；hide 模式用于隐藏，deferred-quit 模式用于退出缓冲 */
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
  /** 所属卷序号（从 1 开始）；不改变章节在数组中的索引 */
  volumeIndex?: number;
  /** 所属卷标题（若原文提供） */
  volumeTitle?: string;
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

/** 单章正文载荷 */
export interface ChapterContent {
  /** 所属书籍 ID */
  bookId: string;
  /** 章节索引 */
  chapterIndex: number;
  /** 章节标题 */
  title: string;
  /** 单章正文 */
  content: string;
  /** 章节起始字符偏移量 */
  offset: number;
  /** 章节字符长度 */
  length: number;
  /** 全书字符长度 */
  totalLength: number;
  /** 全书章节数 */
  totalChapters: number;
}

/** 打开书籍结果 */
export interface ReaderOpenResult {
  /** 书籍元数据 */
  book: BookMeta;
  /** 已保存或默认阅读进度 */
  progress: ReadingProgress;
  /** 当前进度对应章节正文 */
  chapterContent: ChapterContent;
}

/** 搜索结果 */
export interface SearchResult {
  /** 所属书籍 ID */
  bookId: string;
  /** 所属章节索引 */
  chapterIndex: number;
  /** 所属章节标题 */
  chapterTitle: string;
  /** 命中在章节内的字符偏移量 */
  chapterOffset: number;
  /** 命中在全书内的字符偏移量 */
  absoluteOffset: number;
  /** 包含命中词的短文本 */
  snippet: string;
}

/** 书签 */
export interface Bookmark {
  /** 书签 ID */
  id: string;
  /** 所属书籍 ID */
  bookId: string;
  /** 所属章节索引 */
  chapterIndex: number;
  /** 章节内滚动位置（像素） */
  scrollPosition: number;
  /** 全书阅读百分比 */
  percentage: number;
  /** 显示标题 */
  title: string;
  /** 摘要 */
  excerpt: string;
  /** 创建时间戳 */
  createdAt: number;
}

/** 新建书签输入 */
export interface BookmarkInput {
  chapterIndex: number;
  scrollPosition: number;
  percentage: number;
  title: string;
  excerpt: string;
}

/** 备份文件格式 */
export interface MoyuBackup {
  version: 1;
  exportedAt: number;
  books: Array<{
    meta: BookMeta;
    content: string;
  }>;
  progress: Record<string, ReadingProgress>;
  bookmarks: Record<string, Bookmark[]>;
}

/** 导入结果 */
export interface ImportResult {
  success: boolean;
  book?: BookData;
  error?: ImportError;
}

/** 导入到书架的结果 */
export interface BookImportResult {
  success: boolean;
  bookMeta?: BookMeta;
  error?: ImportError;
}

/** 导入错误 */
export interface ImportError {
  code: 'INVALID_FORMAT' | 'EMPTY_FILE' | 'UNSUPPORTED_ENCODING' | 'FILE_TOO_LARGE' | 'IMPORT_FAILED';
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
