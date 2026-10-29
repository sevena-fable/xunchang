import { useLayoutEffect, useRef, useState } from 'react'
import Modal from './Modal'

export default function AnnotationPopover({ annotation, anchor, editable, onSave, onDelete, onClose }) {
  const card = useRef(null)
  const writing = useRef(null)
  const composing = useRef(false)
  const [note, setNote] = useState(annotation.note || '')
  const [position, setPosition] = useState({ left: 16, top: 16 })

  useLayoutEffect(() => {
    if (editable) writing.current.focus({ preventScroll: true })
  }, [editable])

  useLayoutEffect(() => {
    const fit = () => {
      const element = writing.current
      const panel = card.current
      const css = getComputedStyle(panel)
      const inset = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight) + parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth)
      const available = Math.min(416, window.innerHeight - 32 - (panel.offsetHeight - element.offsetHeight))
      const measure = document.createElement('span')
      measure.className = 'annotation-lines'
      measure.textContent = note + '\u200b'
      Object.assign(measure.style, { position: 'fixed', visibility: 'hidden', width: 'max-content', height: 'auto', whiteSpace: 'pre', overflow: 'hidden', pointerEvents: 'none' })
      panel.append(measure)
      panel.style.width = `${Math.min(window.innerWidth - 32, 368, Math.max(120, Math.ceil(measure.getBoundingClientRect().width) + inset + 2))}px`
      measure.style.whiteSpace = 'pre-wrap'
      // Measure separately so resizing never resets the editor's caret or scroll position.
      for (let attempt = 0; attempt < 2; attempt++) {
        measure.style.width = `${element.clientWidth}px`
        element.style.height = `${Math.min(available, measure.getBoundingClientRect().height)}px`
      }
      measure.remove()
    }
    fit()
    window.addEventListener('resize', fit)
    document.fonts.addEventListener('loadingdone', fit)
    return () => { window.removeEventListener('resize', fit); document.fonts.removeEventListener('loadingdone', fit) }
  }, [note, editable])

  useLayoutEffect(() => {
    const place = () => {
      const { width, height } = card.current.getBoundingClientRect()
      const below = anchor.bottom + 8
      setPosition({
        left: Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(below + height <= window.innerHeight - 16 ? below : anchor.top - height - 8, window.innerHeight - height - 16)),
      })
    }
    const observer = new ResizeObserver(place)
    observer.observe(card.current)
    window.addEventListener('resize', place)
    place()
    return () => { observer.disconnect(); window.removeEventListener('resize', place) }
  }, [anchor])

  return (
    <Modal label={editable ? '编辑批注' : '查看批注'} className="annotation-modal" onClose={onClose}>
      <section ref={card} className="annotation-card" style={position} onKeyDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="关闭批注" className="annotation-close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        {editable ? (
          <form onSubmit={(event) => { event.preventDefault(); if (!composing.current && note.trim()) onSave(note) }}>
            <textarea ref={writing} className="annotation-lines thin-scroll" aria-label="批注内容" value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              onCompositionStart={() => { composing.current = true }}
              onCompositionEnd={(event) => { composing.current = false; setNote(event.currentTarget.value) }}
              rows={1} spellCheck={false} />
            <div className="annotation-actions">
              {annotation.id && <button type="button" onClick={onDelete} className="annotation-delete" aria-label="删除批注">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" /></svg>
              </button>}
              <button type="submit" className="annotation-save" aria-label="保存批注" disabled={!note.trim()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
              </button>
            </div>
          </form>
        ) : <p ref={writing} className="annotation-lines annotation-note thin-scroll" tabIndex={0} aria-label="批注内容">{annotation.note}</p>}
      </section>
    </Modal>
  )
}
