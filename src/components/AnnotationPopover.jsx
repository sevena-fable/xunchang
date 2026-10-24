import { useLayoutEffect, useRef, useState } from 'react'
import { ANNOTATION_LIMIT, characterCount, characterOffset, textReplacement } from '../lib/annotations'
import Modal from './Modal'

export default function AnnotationPopover({ annotation, anchor, editable, onSave, onDelete, onClose }) {
  const card = useRef(null)
  const writing = useRef(null)
  const editStart = useRef(null)
  const composing = useRef(false)
  const [note, setNote] = useState(annotation.note || '')
  const [position, setPosition] = useState({ left: 16, top: 16 })
  const count = characterCount(note)

  useLayoutEffect(() => {
    if (!editable) return
    const root = writing.current
    root.focus({ preventScroll: true })
    const beforeInput = () => { if (!composing.current) rememberEdit(root) }
    root.addEventListener('beforeinput', beforeInput)
    return () => root.removeEventListener('beforeinput', beforeInput)
  }, [editable])

  function rememberEdit(root) {
    editStart.current = {
      text: root.value,
      range: { start: characterOffset(root.value, root.selectionStart), end: characterOffset(root.value, root.selectionEnd) },
    }
  }

  function changeNote(root) {
    if (composing.current) { setNote(root.value); return }
    const before = editStart.current || { text: note }
    editStart.current = null
    let next = root.value
    if (characterCount(next) > ANNOTATION_LIMIT) {
      const old = Array.from(before.text)
      const edit = textReplacement(before.text, next, before.range)
      const capacity = Math.max(0, ANNOTATION_LIMIT - old.length + edit.end - edit.start)
      const prefix = old.slice(0, edit.start).join('')
      const inserted = Array.from(next).slice(edit.start, edit.start + Math.min(capacity, edit.inserted)).join('')
      next = prefix + inserted + old.slice(edit.end).join('')
      root.value = next
      root.setSelectionRange(prefix.length + inserted.length, prefix.length + inserted.length)
    }
    setNote(next)
  }

  useLayoutEffect(() => {
    const fit = () => {
      const element = writing.current
      const panel = card.current
      const css = getComputedStyle(panel)
      const inset = parseFloat(css.paddingLeft) + parseFloat(css.paddingRight) + parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth)
      const available = window.innerHeight - 32 - (panel.offsetHeight - element.offsetHeight)
      const measure = document.createElement('span')
      measure.className = 'annotation-lines'
      measure.textContent = note + '\u200b'
      Object.assign(measure.style, { position: 'fixed', visibility: 'hidden', width: 'max-content', height: 'auto', whiteSpace: 'pre', pointerEvents: 'none' })
      panel.append(measure)
      let fontSize = 16
      let lineHeight = 26
      const size = () => {
        panel.style.setProperty('--annotation-font-size', `${fontSize}px`)
        panel.style.setProperty('--annotation-line-height', `${lineHeight}px`)
        panel.style.width = `${Math.min(window.innerWidth - 32, 368, Math.max(120, Math.ceil(measure.getBoundingClientRect().width) + inset + 2))}px`
        element.style.height = '0px'
      }
      size()
      // Explicit line breaks must also fit without changing the stored note.
      for (let attempt = 0; element.scrollHeight > available && attempt < 4; attempt++) {
        const scale = (available - 2) / element.scrollHeight
        fontSize *= scale
        lineHeight *= scale
        size()
      }
      measure.remove()
      element.style.height = `${Math.min(available, Math.max(lineHeight, element.scrollHeight))}px`
      element.scrollTop = 0
      element.scrollLeft = 0
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
          <form onSubmit={(event) => { event.preventDefault(); if (!composing.current && note.trim() && count <= ANNOTATION_LIMIT) onSave(note) }}>
            <textarea ref={writing} className="annotation-lines" aria-label="批注内容" aria-invalid={count > ANNOTATION_LIMIT} value={note}
              onChange={(event) => changeNote(event.currentTarget)}
              onCompositionStart={(event) => { rememberEdit(event.currentTarget); composing.current = true }}
              onCompositionEnd={(event) => { composing.current = false; changeNote(event.currentTarget) }}
              rows={1} aria-describedby="annotation-count" spellCheck={false} />
            <p id="annotation-count" className="sr-only" role="status">{count}/{ANNOTATION_LIMIT}{count > ANNOTATION_LIMIT && ' · 批注不能超过 100 字'}</p>
            <div className="annotation-actions">
              {annotation.id && <button type="button" onClick={onDelete} className="annotation-delete" aria-label="删除批注">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" /></svg>
              </button>}
              <button type="submit" className="annotation-save" aria-label="保存批注" disabled={!note.trim() || count > ANNOTATION_LIMIT}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
              </button>
            </div>
          </form>
        ) : <p ref={writing} className="annotation-lines annotation-note">{annotation.note}</p>}
      </section>
    </Modal>
  )
}
