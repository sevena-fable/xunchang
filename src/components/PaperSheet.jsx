import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { LINE_HEIGHT, offsetTop, pageMetrics, pageStart, paperSelection, readPaperText, selectPaperText, writePaperText } from '../lib/paper'
import { sfxPaper } from '../lib/sfx'

const PAPER_VIEWPORT = '(min-width: 900px) and (min-height: 600px)'
function subscribeViewport(listener) {
  const query = window.matchMedia(PAPER_VIEWPORT)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
export function usePaperViewport() {
  return useSyncExternalStore(subscribeViewport, () => window.matchMedia(PAPER_VIEWPORT).matches)
}
function PaperWindowHint({ onClose, disabled = false, buttonRef }) {
  return (
    <div className="paper-window-hint" role="status">
      <p>把窗口放大些，再铺开这张纸。</p>
      <p>请按 F11 进入浏览器全屏后再试。</p>
      <button ref={buttonRef} type="button" onClick={onClose} disabled={disabled}>收起</button>
    </div>
  )
}

export function PaperWorkspace({ fitsViewport, onClose, disabled = false, children }) {
  const workspace = useRef(null)
  const hint = useRef(null)
  const focused = useRef(null)
  const previousFits = useRef(fitsViewport)

  useLayoutEffect(() => {
    if (previousFits.current === fitsViewport) return
    previousFits.current = fitsViewport
    const active = document.activeElement
    if (active !== document.body && !workspace.current.contains(active)) return
    if (!fitsViewport) {
      hint.current?.focus({ preventScroll: true })
    } else {
      const target = focused.current
      const destination = target?.isConnected && !target.matches(':disabled, [aria-disabled="true"]') ? target : workspace.current.querySelector('button:not(:disabled)')
      destination?.focus({ preventScroll: true })
    }
  }, [fitsViewport])

  useLayoutEffect(() => {
    const element = workspace.current
    const observer = new MutationObserver(() => {
      const target = focused.current
      const active = document.activeElement
      if (element.hidden || !target?.matches(':disabled, [aria-disabled="true"]') || (active !== document.body && active !== target)) return
      element.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
    })
    // 重排可能在焦点恢复之后才禁用首尾页按钮。
    observer.observe(element, { attributes: true, attributeFilter: ['disabled', 'aria-disabled'], subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <>
      {!fitsViewport && <PaperWindowHint onClose={onClose} disabled={disabled} buttonRef={hint} />}
      <div ref={workspace} className="letter-workspace" hidden={!fitsViewport} onFocusCapture={(event) => {
        if (workspace.current.contains(event.target)) focused.current = event.target
      }}>
        {children}
      </div>
    </>
  )
}

export default function PaperSheet({ style, content = '', onChange, header, onClose, disabled = false, readOnly = false, inputRef }) {
  const area = useRef(null)
  const mirror = useRef(null)
  const localEditor = useRef(null)
  const editor = inputRef || localEditor
  const composing = useRef(false)
  const selection = useRef({ anchor: 0, focus: 0 })
  const anchor = useRef(0)
  const [size, setSize] = useState({ width: 0, height: LINE_HEIGHT })
  const [layout, setLayout] = useState({ pageHeight: LINE_HEIGHT, count: 1, height: LINE_HEIGHT })
  const [page, setPage] = useState(0)
  const editable = typeof onChange === 'function'
  const current = Math.min(page, layout.count - 1)

  useLayoutEffect(() => {
    if (!editable || composing.current || readPaperText(editor.current) === content) return
    writePaperText(editor.current, content)
    selection.current = {
      anchor: Math.min(selection.current.anchor, content.length),
      focus: Math.min(selection.current.focus, content.length),
    }
    if (document.activeElement === editor.current) selectPaperText(editor.current, selection.current.anchor, selection.current.focus)
  }, [content, editable])

  useLayoutEffect(() => {
    const element = area.current
    let active = true
    const measure = () => {
      if (active && element.clientWidth && element.clientHeight) setSize({ width: element.clientWidth, height: element.clientHeight })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    measure()
    return () => { active = false; observer.disconnect(); document.fonts.removeEventListener('loadingdone', measure) }
  }, [])

  useLayoutEffect(() => {
    if (!mirror.current.getClientRects().length) return
    const height = Math.max(LINE_HEIGHT, mirror.current.offsetHeight)
    const next = { ...pageMetrics(height, size.height), height }
    setLayout(next)
    const offset = editable ? selection.current.focus : anchor.current
    if (!composing.current) setPage(Math.min(next.count - 1, Math.floor(offsetTop(mirror.current, offset) / next.pageHeight)))
  }, [content, size, editable])

  useLayoutEffect(() => {
    if (!editable) return
    const changed = () => {
      if (document.activeElement !== editor.current || composing.current) return
      const next = paperSelection(editor.current)
      if (!next) return
      selection.current = next
      setPage(Math.min(layout.count - 1, Math.floor(offsetTop(mirror.current, next.focus) / layout.pageHeight)))
    }
    document.addEventListener('selectionchange', changed)
    return () => document.removeEventListener('selectionchange', changed)
  }, [editable, layout])

  function edit() {
    if (disabled || readOnly) return
    selection.current = paperSelection(editor.current) || selection.current
    onChange(readPaperText(editor.current))
  }

  function flip(direction) {
    const next = Math.max(0, Math.min(layout.count - 1, current + direction))
    if (next === current || composing.current) return
    const offset = pageStart(mirror.current, content, next, layout.pageHeight)
    anchor.current = offset
    if (editable) {
      selection.current = { anchor: offset, focus: offset }
      editor.current.focus({ preventScroll: true })
      selectPaperText(editor.current, offset)
    }
    setPage(next)
    sfxPaper()
  }

  return (
    <section className="letter-sheet" style={{ '--paper': style.paper, '--ink': style.ink, '--rule': style.border, '--paper-line-height': `${LINE_HEIGHT}px` }} aria-label={editable ? '分享内容' : '阅读内容'} onKeyDown={(event) => {
      if (disabled || event.nativeEvent.isComposing || composing.current) return
      if (event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault()
        flip(event.key === 'PageDown' ? 1 : -1)
      }
    }}>
      <header className="paper-heading">
        <span>{header}</span>
        <button type="button" onClick={onClose} disabled={disabled} aria-label="关闭信纸" className="paper-close">×</button>
      </header>
      <div className="paper-body" ref={area}>
        <div className="paper-mirror paper-text" ref={mirror} aria-hidden="true">{content + '\u200b'}</div>
        <div className="paper-window" style={{ height: layout.pageHeight }}>
          {editable ? (
            <div
              ref={editor}
              className="paper-text paper-editor"
              lang="zh-CN"
              role="textbox"
              aria-label="分享正文"
              aria-multiline="true"
              aria-disabled={disabled}
              aria-readonly={readOnly}
              tabIndex={disabled ? -1 : 0}
              spellCheck={false}
              contentEditable={disabled || readOnly ? false : 'plaintext-only'}
              suppressContentEditableWarning
              onInput={edit}
              onFocus={() => selectPaperText(editor.current, selection.current.anchor, selection.current.focus)}
              onCompositionStart={() => { composing.current = true }}
              onCompositionEnd={() => { composing.current = false; edit() }}
              style={{ minHeight: layout.pageHeight, transform: `translateY(-${current * layout.pageHeight}px)` }}
            />
          ) : (
            <div lang="zh-CN" className="paper-text paper-reading" style={{ transform: `translateY(-${current * layout.pageHeight}px)` }}>{content || '（照片）'}</div>
          )}
        </div>
      </div>
      <footer className="paper-pagination">
        <button type="button" className="paper-turn paper-previous" aria-label="上一页" disabled={disabled || current === 0} onClick={() => flip(-1)}><svg viewBox="0 0 16 24" aria-hidden="true"><path d="m10 5-6 7 6 7" /></svg></button>
        <output aria-live="polite" aria-label="信纸页码">{current + 1} / {layout.count}</output>
        <button type="button" className="paper-turn paper-next" aria-label="下一页" disabled={disabled || current === layout.count - 1} onClick={() => flip(1)}><svg viewBox="0 0 16 24" aria-hidden="true"><path d="m6 5 6 7-6 7" /></svg></button>
      </footer>
    </section>
  )
}
