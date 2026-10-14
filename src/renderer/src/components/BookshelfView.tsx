import { useState, useEffect, useCallback, useRef } from 'react'
import { useImportHandler } from './ImportHandler'
import { showToast } from './Toast'
import ConfirmDialog from './ConfirmDialog'
import Icon from './Icon'
import './BookshelfView.css'

/** 书名最大显示长度 */
const MAX_TITLE_DISPLAY = 50

interface BookItem {
  id: string
  title: string
  percentage: number
  lastReadAt: number
  chapterCount: number
}

interface BookshelfViewProps {
  onOpenBook: (bookId: string) => void
}

/** 截断书名：超过 50 字符时以省略号截断 */
function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_DISPLAY) return title
  return title.slice(0, MAX_TITLE_DISPLAY) + '…'
}

export default function BookshelfView({ onOpenBook }: BookshelfViewProps): JSX.Element {
  const [books, setBooks] = useState<BookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  /** 同一次编辑只提交一次：Enter 提交后紧随的 blur 必须被忽略。 */
  const editCommitRef = useRef(false)
  const { handleImport: importFile } = useImportHandler()

  /** 加载书架数据 */
  const loadBooks = useCallback(async () => {
    try {
      // 一次 IPC 拿到书籍 + 进度，避免对每本书各发一次 getProgress。
      const library = await window.api.bookshelf.getLibrary()
      const bookItems: BookItem[] = library.map(({ book, progress }) => ({
        id: book.id,
        title: book.title,
        percentage: progress?.percentage ?? 0,
        lastReadAt: book.lastReadAt,
        chapterCount: book.chapters.length
      }))
      setBooks(bookItems)
    } catch {
      showToast('书架加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBooks()
  }, [loadBooks])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  /** 导入文件 */
  const handleImport = async (): Promise<void> => {
    const success = await importFile()
    if (success) {
      await loadBooks()
    }
  }
  const handleBackupExport = async (): Promise<void> => {
    try {
      const result = await window.api.backup.export()
      if (result.success) {
        showToast('备份已导出')
      } else if (result.error) {
        showToast(`备份失败：${result.error}`)
      }
    } catch {
      showToast('备份失败，请重试')
    }
  }

  const handleBackupRestore = async (): Promise<void> => {
    const result = await window.api.backup.restore()
    if (result.success) {
      showToast(`已恢复 ${result.importedBooks ?? 0} 本小说`)
      await loadBooks()
    } else if (result.error) {
      showToast(`恢复失败：${result.error}`)
    }
  }

  /** 开始删除确认 */
  const handleDeleteClick = (e: React.MouseEvent, bookId: string): void => {
    e.stopPropagation()
    setDeleteTarget(bookId)
  }

  /** 确认删除 */
  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    try {
      await window.api.bookshelf.remove(deleteTarget)
      setDeleteTarget(null)
      await loadBooks()
    } catch {
      showToast('删除失败，请重试')
    }
  }

  /** 取消删除 */
  const cancelDelete = (): void => {
    setDeleteTarget(null)
  }

  /** 开始编辑书名 */
  const handleEditClick = (e: React.MouseEvent, book: BookItem): void => {
    e.stopPropagation()
    editCommitRef.current = false
    setEditingId(book.id)
    setEditValue(book.title)
  }

  /** 保存编辑的书名 */
  const saveEdit = async (): Promise<void> => {
    // Enter 提交后输入框会卸载并触发 blur，导致同一次编辑提交两次
    // （第二次还带着已被清空的 editValue）。用 ref 做一次性闸门。
    if (!editingId || editCommitRef.current) return
    editCommitRef.current = true

    const bookId = editingId
    const trimmed = editValue.trim()
    setEditingId(null)
    setEditValue('')

    if (trimmed.length > 0) {
      try {
        await window.api.bookshelf.updateTitle(bookId, trimmed)
      } catch {
        showToast('书名修改失败，请重试')
      }
    }
    await loadBooks()
    editCommitRef.current = false
  }

  /** 取消编辑，不写入任何内容 */
  const cancelEdit = (): void => {
    editCommitRef.current = true
    setEditingId(null)
    setEditValue('')
    // 让下一次编辑可以正常提交。
    queueMicrotask(() => {
      editCommitRef.current = false
    })
  }

  /** 编辑输入框键盘事件 */
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  const handleBookKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, bookId: string): void => {
    if (e.target !== e.currentTarget) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onOpenBook(bookId)
  }

  const formatLastRead = (timestamp: number): string => {
    if (!timestamp || timestamp <= 1) return '尚未阅读'

    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return '尚未阅读'

    const now = new Date()
    const sameDay = date.toDateString() === now.toDateString()
    if (sameDay) {
      return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
    }

    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    })
  }

  const visibleBooks = books.filter((book) => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return !query || book.title.toLocaleLowerCase().includes(query)
  })

  // 侧栏统计：只统计真实数据，避免出现点了没反应的装饰性入口。
  const finishedCount = books.filter((book) => book.percentage >= 100).length
  const inProgressCount = books.filter(
    (book) => book.percentage > 0 && book.percentage < 100
  ).length

  if (loading) {
    return (
      <div className="bookshelf bookshelf-loading" aria-busy="true">
        <aside className="bookshelf-sidebar" aria-hidden="true">
          <div className="bookshelf-brand-skeleton" />
        </aside>
        <main className="bookshelf-main">
          <div className="bookshelf-loading-grid" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="bookshelf-loading-skeleton">
                <span />
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ))}
          </div>
          <p>正在整理书架…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="bookshelf">
      <aside className="bookshelf-sidebar">
        <div className="bookshelf-brand">
          <div className="bookshelf-brand-mark" aria-hidden="true">M</div>
          <div className="bookshelf-brand-text">
            <strong>MoyuReader</strong>
            <span>本地 TXT 阅读器</span>
          </div>
        </div>

        <button className="bookshelf-import-btn" onClick={handleImport} type="button">
          <Icon name="plus" size={17} />
          导入小说
        </button>

        <dl className="bookshelf-stats">
          <div className="bookshelf-stat">
            <dt>藏书</dt>
            <dd>{books.length}</dd>
          </div>
          <div className="bookshelf-stat">
            <dt>在读</dt>
            <dd>{inProgressCount}</dd>
          </div>
          <div className="bookshelf-stat">
            <dt>已读完</dt>
            <dd>{finishedCount}</dd>
          </div>
        </dl>

        <div className="bookshelf-sidebar-footer">
          <button
            className="bookshelf-sidebar-link"
            type="button"
            onClick={handleBackupExport}
          >
            <Icon name="archive" size={16} />
            导出备份
          </button>
          <button
            className="bookshelf-sidebar-link"
            type="button"
            onClick={handleBackupRestore}
          >
            <Icon name="download" size={16} />
            从备份恢复
          </button>
        </div>
      </aside>

      <main className="bookshelf-main">
        <header className="bookshelf-header">
          <div className="bookshelf-heading">
            <div className="bookshelf-title-row">
              <h2>书架</h2>
              <span className="bookshelf-count">{books.length} 本</span>
            </div>
            <p className="bookshelf-subtitle">
              {books.length === 0
                ? '导入一本 TXT 小说，开始阅读。'
                : '继续上次阅读，或导入新的小说。'}
            </p>
          </div>
          <div className="bookshelf-header-actions">
            <label className="bookshelf-search">
              <Icon name="search" size={16} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索书名"
                aria-label="搜索书名"
                type="search"
              />
            </label>
            <div className="bookshelf-view-switcher" role="group" aria-label="书架视图">
              <button
                className={viewMode === 'list' ? 'active' : ''}
                type="button"
                aria-label="列表视图"
                data-tooltip="列表视图"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                <Icon name="list" size={16} />
              </button>
              <button
                className={viewMode === 'grid' ? 'active' : ''}
                type="button"
                aria-label="网格视图"
                data-tooltip="网格视图"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
              >
                <Icon name="grid" size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="bookshelf-body">
          {books.length === 0 ? (
            <div className="bookshelf-empty">
              <div className="bookshelf-empty-mark" aria-hidden="true"><Icon name="library" size={27} /></div>
              <p>书架为空，请导入小说</p>
              <span className="bookshelf-empty-hint">把 TXT 拖进来，继续你的阅读</span>
              <button className="bookshelf-import-btn" onClick={handleImport}>
                <Icon name="plus" size={16} />
                导入小说
              </button>
            </div>
          ) : visibleBooks.length === 0 ? (
            <div className="bookshelf-empty bookshelf-no-results">
              <div className="bookshelf-empty-mark" aria-hidden="true"><Icon name="search" size={27} /></div>
              <p>没有找到匹配的书</p>
              <span className="bookshelf-empty-hint">试试书名中的其他关键词</span>
            </div>
          ) : (
            <>
              <div className={`bookshelf-list-header ${viewMode === 'grid' ? 'is-hidden' : ''}`} aria-hidden="true">
                <span>书名</span>
                <span>最近阅读</span>
                <span>阅读进度</span>
                <span />
              </div>
              <ul className={`bookshelf-list ${viewMode === 'grid' ? 'is-grid' : ''}`}>
          {visibleBooks.map((book) => (
            <li
              key={book.id}
              className="bookshelf-item"
              onClick={() => onOpenBook(book.id)}
              onKeyDown={(event) => handleBookKeyDown(event, book.id)}
              tabIndex={0}
              role="button"
              aria-label={`打开《${book.title}》`}
            >
              <div className="bookshelf-item-identity">
                <div className="bookshelf-item-mark" aria-hidden="true">
                  {book.title.trim().charAt(0) || '书'}
                </div>
                <div className="bookshelf-item-info">
                  {editingId === book.id ? (
                    <input
                      ref={editInputRef}
                      className="bookshelf-edit-input"
                      value={editValue}
                      maxLength={MAX_TITLE_DISPLAY}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={() => void saveEdit()}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="编辑书名"
                    />
                  ) : (
                    <>
                      <div className="bookshelf-item-title" title={book.title}>
                        {truncateTitle(book.title)}
                      </div>
                      <div className="bookshelf-item-author">
                        {book.chapterCount > 0 ? `${book.chapterCount} 章` : '未解析章节'}
                        <span className="bookshelf-item-dot" aria-hidden="true">·</span>
                        {formatLastRead(book.lastReadAt)}
                      </div>
                      <div className="bookshelf-item-progress-row">
                        <div className="bookshelf-item-progress-track" aria-hidden="true">
                          <span
                            style={{
                              transform: `scaleX(${Math.max(0, Math.min(100, book.percentage)) / 100})`
                            }}
                          />
                        </div>
                        <div className="bookshelf-item-progress">
                          进度：{book.percentage}%
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="bookshelf-item-last-read">{formatLastRead(book.lastReadAt)}</div>
              <div className="bookshelf-item-progress-column">
                <div className="bookshelf-item-progress-track" aria-hidden="true">
                  <span
                    style={{
                      transform: `scaleX(${Math.max(0, Math.min(100, book.percentage)) / 100})`
                    }}
                  />
                </div>
                <span>{book.percentage}%</span>
              </div>
              <div className="bookshelf-item-actions">
                <button
                  className="bookshelf-edit-btn"
                  onClick={(e) => handleEditClick(e, book)}
                  aria-label={`重命名《${book.title}》`}
                  data-tooltip="重命名"
                  data-tooltip-side="top"
                  type="button"
                >
                  <Icon name="edit" size={15} />
                </button>
                <button
                  className="bookshelf-delete-btn"
                  onClick={(e) => handleDeleteClick(e, book.id)}
                  aria-label={`删除《${book.title}》`}
                  data-tooltip="删除"
                  data-tooltip-side="top"
                  type="button"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            <span className="bookshelf-item-open-hint" aria-hidden="true">打开 <Icon name="arrow-up-right" size={13} /></span>
            </li>
          ))}
              </ul>
            </>
          )}
        </div>
      </main>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除《${books.find((book) => book.id === deleteTarget)?.title ?? '这本小说'}》？`}
        description="确定要删除这本小说吗？删除后将无法恢复。"
        confirmLabel="确认删除"
        cancelLabel="取消"
        destructive
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </div>
  )
}
