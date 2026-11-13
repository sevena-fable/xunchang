import Panel from './Panel'
import { dayKey } from '../lib/letterFormat'

export default function MailboxPanel({ open, onClose, onRead, history, unread, userId, loading, error, retry }) {
  const newIds = new Set(unread.map((letter) => letter.id))
  const received = history.filter((letter) => letter.sender_id !== userId)
  const groups = [
    ['新信', unread],
    ['已读来信', received.filter((letter) => !newIds.has(letter.id))],
  ]

  return (
    <Panel open={open} onClose={onClose} title="屋外信箱"
      subtitle={unread.length ? `${unread.length} 封新信等你打开` : undefined}>
      {loading && <p role="status">正在查看信箱…</p>}
      {error && <p role="alert">{error} <button className="panel-link" onClick={retry}>重试</button></p>}
      {!loading && !error && !received.length && <p>信箱里还没有来信。</p>}
      {groups.map(([label, items]) => items.length > 0 && (
        <section key={label} className="mb-4 last:mb-0" aria-label={label}>
          <h4 className="mb-2 text-sm text-[var(--panel-muted)]">{label}</h4>
          <ul className="space-y-2">
            {items.map((letter) => (
              <li key={letter.id}>
                <button type="button" onClick={() => onRead(letter)} data-unread={newIds.has(letter.id)} className="panel-box mailbox-row">
                  <svg className="mailbox-row-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m4 7 8 6 8-6" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate">{letter.content?.trim() || '（照片）'}</span>
                  <time className="shrink-0 text-xs">{dayKey(letter.delivered_at || letter.sealed_at)}</time>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Panel>
  )
}
