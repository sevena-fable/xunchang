import Modal from './Modal'

function Panel({ open, title, subtitle, onClose, children, width = 'max-w-lg', tone = 'paper' }) {
  const night = tone === 'night'
  return (
    <Modal open={open} onClose={onClose} label={title || '面板'}>
      <section className={`w-full ${width} thin-scroll max-h-full overflow-y-auto rounded-2xl border p-6`} style={{ background: night ? '#262c42' : '#f7f2ee', borderColor: night ? '#bac3d440' : '#bac3d4b3', color: night ? '#e8eef9' : '#4a4358', boxShadow: '0 18px 50px #4a435840' }}>
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg tracking-[.18em]">{title}</h3>
            {subtitle && <p className="mt-1 text-xs opacity-70">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="px-2 text-xl">×</button>
        </header>
        {children}
      </section>
    </Modal>
  )
}

export function PrimaryButton({ children, className = '', ...rest }) {
  return <button {...rest} className={`rounded-xl border border-[#c4cce0] bg-[#d3d9e8] px-6 py-2.5 text-sm tracking-[.18em] text-[#4a4358] transition-colors hover:bg-[#c4cce0] disabled:opacity-45 ${className}`}>{children}</button>
}

export function GhostButton({ children, className = '', ...rest }) {
  return <button {...rest} className={`rounded-xl border border-[#bac3d4] px-6 py-2.5 text-sm tracking-[.18em] text-[#6e667a] hover:bg-[#edf0f4] disabled:opacity-45 ${className}`}>{children}</button>
}

export default Panel
