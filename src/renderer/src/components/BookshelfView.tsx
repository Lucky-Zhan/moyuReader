import { useState, useEffect, useCallback, useRef } from 'react'
import { useImportHandler } from './ImportHandler'
import { showToast } from './Toast'
import './BookshelfView.css'

/** 书名最大显示长度 */
const MAX_TITLE_DISPLAY = 50

interface BookItem {
  id: string
  title: string
  percentage: number
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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const { handleImport: importFile } = useImportHandler()

  /** 加载书架数据 */
  const loadBooks = useCallback(async () => {
    try {
      const result = await window.api.bookshelf.getAll()
      const bookItems: BookItem[] = await Promise.all(
        result.map(async (book) => {
          const progress = await window.api.bookshelf.getProgress(book.id)

          return {
            id: book.id,
            title: book.title,
            percentage: progress?.percentage ?? 0
          }
        })
      )
      setBooks(bookItems)
    } catch {
      setBooks([])
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
    const result = await window.api.backup.export()
    if (result.success) {
      showToast('备份已导出')
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
    await window.api.bookshelf.remove(deleteTarget)
    setDeleteTarget(null)
    await loadBooks()
  }

  /** 取消删除 */
  const cancelDelete = (): void => {
    setDeleteTarget(null)
  }

  /** 开始编辑书名 */
  const handleEditClick = (e: React.MouseEvent, book: BookItem): void => {
    e.stopPropagation()
    setEditingId(book.id)
    setEditValue(book.title)
  }

  /** 保存编辑的书名 */
  const saveEdit = async (): Promise<void> => {
    if (!editingId) return
    const trimmed = editValue.trim()
    if (trimmed && trimmed.length > 0) {
      await window.api.bookshelf.updateTitle(editingId, trimmed)
    }
    setEditingId(null)
    setEditValue('')
    await loadBooks()
  }

  /** 编辑输入框键盘事件 */
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      setEditingId(null)
      setEditValue('')
    }
  }

  const handleBookKeyDown = (e: React.KeyboardEvent<HTMLLIElement>, bookId: string): void => {
    if (e.target !== e.currentTarget) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onOpenBook(bookId)
  }

  if (loading) {
    return (
      <div className="bookshelf bookshelf-loading" aria-busy="true">
        <div className="bookshelf-loading-orb" aria-hidden="true" />
        <p>正在整理书架…</p>
      </div>
    )
  }

  return (
    <div className="bookshelf">
      <div className="bookshelf-header">
        <div className="bookshelf-heading">
          <span className="bookshelf-eyebrow">MoyuReader</span>
          <div className="bookshelf-title-row">
            <h2>书架</h2>
            <span className="bookshelf-count">{books.length > 0 ? `${books.length} 本` : '准备开始'}</span>
          </div>
        </div>
        <div className="bookshelf-header-actions">
          <button className="bookshelf-secondary-btn" onClick={handleBackupExport}>
            备份
          </button>
          <button className="bookshelf-secondary-btn" onClick={handleBackupRestore}>
            恢复
          </button>
          <button className="bookshelf-import-btn" onClick={handleImport}>
            导入小说
          </button>
        </div>
      </div>

      {books.length === 0 ? (
        <div className="bookshelf-empty">
          <div className="bookshelf-empty-mark" aria-hidden="true">⌁</div>
          <p>书架为空，请导入小说</p>
          <span className="bookshelf-empty-hint">把 TXT 拖进来，继续你的阅读</span>
          <button className="bookshelf-import-btn" onClick={handleImport}>
            导入小说
          </button>
        </div>
      ) : (
        <ul className="bookshelf-list">
          {books.map((book) => (
            <li
              key={book.id}
              className="bookshelf-item"
              onClick={() => onOpenBook(book.id)}
              onKeyDown={(event) => handleBookKeyDown(event, book.id)}
              tabIndex={0}
              role="button"
              aria-label={`打开《${book.title}》`}
            >
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
                    onBlur={saveEdit}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div className="bookshelf-item-title" title={book.title}>
                      {truncateTitle(book.title)}
                    </div>
                    <div className="bookshelf-item-progress-row">
                      <div className="bookshelf-item-progress-track" aria-hidden="true">
                        <span style={{ width: `${Math.max(0, Math.min(100, book.percentage))}%` }} />
                      </div>
                      <div className="bookshelf-item-progress">
                        进度：{book.percentage}%
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="bookshelf-item-actions">
                <button
                  className="bookshelf-edit-btn"
                  onClick={(e) => handleEditClick(e, book)}
                >
                  编辑
                </button>
                <button
                  className="bookshelf-delete-btn"
                  onClick={(e) => handleDeleteClick(e, book.id)}
                >
                  删除
                </button>
              </div>
              <span className="bookshelf-item-open-hint" aria-hidden="true">打开 <span>↗</span></span>
            </li>
          ))}
        </ul>
      )}

      {/* 删除确认对话框 */}
      {deleteTarget && (
        <div className="bookshelf-confirm-overlay" onClick={cancelDelete}>
          <div
            className="bookshelf-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <p>确定要删除这本小说吗？删除后将无法恢复。</p>
            <div className="bookshelf-confirm-actions">
              <button className="bookshelf-confirm-cancel" onClick={cancelDelete}>
                取消
              </button>
              <button className="bookshelf-confirm-ok" onClick={confirmDelete}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
