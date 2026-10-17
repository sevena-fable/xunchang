import Modal from './Modal'

function Panel({ open, title, subtitle, onClose, children, width = 'max-w-lg' }) {
  return (
    <Modal open={open} onClose={onClose} label={title || '面板'}>
      <section className={`panel-card panel-dialog-card w-full ${width}`}>
        <header className="panel-header">
          <h3 className="panel-title">{title}</h3>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          <button type="button" onClick={onClose} aria-label="关闭" className="panel-close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true"><path d="m3 3 10 10M13 3 3 13" /></svg>
          </button>
        </header>
        <div className="panel-content thin-scroll">{children}</div>
      </section>
    </Modal>
  )
}

export function PrimaryButton({ children, className = '', ...rest }) {
  return <button {...rest} className={`panel-primary ${className}`}>{children}</button>
}

export function GhostButton({ children, className = '', ...rest }) {
  return <button {...rest} className={`panel-ghost ${className}`}>{children}</button>
}

export default Panel
