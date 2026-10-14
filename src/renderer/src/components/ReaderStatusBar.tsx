export interface ReaderStatusBarProps {
  chapterIndex: number
  chapterCount: number
  title: string
  percentage: number
}

export function ReaderStatusBar({
  chapterIndex,
  chapterCount,
  title,
  percentage
}: ReaderStatusBarProps): JSX.Element {
  return (
    <div className="reader-status-bar">
      <div className="reader-status-meta">
        <span className="reader-chapter-progress">
          {chapterCount > 0 ? `${chapterIndex + 1}/${chapterCount}` : '0/0'}
        </span>
        <span className="reader-status-title" title={title}>
          阅读中 · {title}
        </span>
      </div>
      <div className="reader-status-progress">
        <div className="reader-progress-track" aria-hidden="true">
          <span style={{ transform: `scaleX(${percentage / 100})` }} />
        </div>
        <span className="reader-progress-text">阅读进度：{percentage}%</span>
      </div>
    </div>
  )
}

export default ReaderStatusBar
