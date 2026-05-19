import { useState, useEffect, useCallback, useRef } from 'react'
import { useImportHandler } from './ImportHandler'
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
      const result = (await window.api.invoke('bookshelf:getAll')) as Array<{
        id: string
        title: string
      }>
      const bookItems: BookItem[] = await Promise.all(
        result.map(async (book) => {
          const progress = (await window.api.invoke(
            'bookshelf:getProgress',
            book.id
          )) as { percentage?: number } | null

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

  /** 开始删除确认 */
  const handleDeleteClick = (e: React.MouseEvent, bookId: string): void => {
    e.stopPropagation()
    setDeleteTarget(bookId)
  }

  /** 确认删除 */
  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    await window.api.invoke('bookshelf:remove', deleteTarget)
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
      await window.api.invoke('bookshelf:updateTitle', editingId, trimmed)
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

  if (loading) {
    return <div className="bookshelf"><p>加载中...</p></div>
  }

  return (
    <div className="bookshelf">
      <div className="bookshelf-header">
        <h2>书架</h2>
        <button className="bookshelf-import-btn" onClick={handleImport}>
          导入小说
        </button>
      </div>

      {books.length === 0 ? (
        <div className="bookshelf-empty">
          <p>书架为空，请导入小说</p>
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
            >
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
                    <div className="bookshelf-item-progress">
                      进度：{book.percentage}%
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
