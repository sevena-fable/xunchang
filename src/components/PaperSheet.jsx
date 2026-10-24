import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { LINE_HEIGHT, offsetTop, pageMetrics, pageStart, paperInputRange, paperSelection, paperTextRects, readPaperText, selectPaperText, writePaperText } from '../lib/paper'
import { annotationSelection, characterCount, characterOffset, domOffset, moveAnnotations } from '../lib/annotations'
import AnnotationPopover from './AnnotationPopover'
import { sfxPaper } from '../lib/sfx'

const NO_ANNOTATIONS = []

function highlightBand(rect) {
  const height = Math.min(14, rect.height * .55)
  const rule = (Math.floor((rect.top + rect.height / 2) / LINE_HEIGHT) + 1) * LINE_HEIGHT
  const bottom = Math.min(rect.top + rect.height * .86, rule - 5)
  return { left: rect.left, top: bottom - height, width: rect.width, height }
}

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

export default function PaperSheet({ style, content = '', annotations = NO_ANNOTATIONS, onChange, onAnnotationsChange, header, onClose, disabled = false, readOnly = false, inputRef }) {
  const area = useRef(null)
  const paperWindow = useRef(null)
  const reading = useRef(null)
  const inputEvent = useRef(null)
  const compositionEvent = useRef(null)
  const pointer = useRef(null)
  const restoreFrame = useRef(null)
  const documentValue = useRef({ content, annotations })
  const history = useRef({ entries: [{ content, annotations }], index: 0 })
  const [marks, setMarks] = useState([])
  const [selectionRects, setSelectionRects] = useState([])
  const [annotationEditor, setAnnotationEditor] = useState(null)
  const [annotationMessage, setAnnotationMessage] = useState('')
  const [inComposition, setInComposition] = useState(false)
  const fitsViewport = usePaperViewport()
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
  const canAnnotate = editable && !disabled && !readOnly && typeof onAnnotationsChange === 'function'

  useLayoutEffect(() => {
    const value = { content, annotations }
    const stack = history.current
    if (documentValue.current.content !== content) {
      stack.entries = [...stack.entries.slice(0, stack.index + 1), value]
      stack.index++
    } else stack.entries[stack.index] = value
    documentValue.current = value
  }, [content, annotations])

  useLayoutEffect(() => {
    if (!fitsViewport || disabled || readOnly) setAnnotationEditor(null)
  }, [fitsViewport, disabled, readOnly])

  useLayoutEffect(() => () => cancelAnimationFrame(restoreFrame.current), [])

  useLayoutEffect(() => {
    if (!editable) return
    const root = editor.current
    const beforeInput = (event) => {
      if (composing.current) return
      inputEvent.current = {
        inputType: event.inputType,
        selection: paperInputRange(root, event.getTargetRanges?.()[0]) || paperSelection(root),
      }
    }
    root.addEventListener('beforeinput', beforeInput)
    return () => root.removeEventListener('beforeinput', beforeInput)
  }, [editable])

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

  useLayoutEffect(() => {
    if (!fitsViewport || inComposition) { setMarks([]); return }
    const root = editable ? editor.current : reading.current
    const box = paperWindow.current.getBoundingClientRect()
    setMarks(annotations.flatMap((item) => {
      const rects = paperTextRects(root, domOffset(content, item.start), domOffset(content, item.end), editable)
        .map((rect) => ({ left: rect.left - box.left, top: rect.top - box.top, width: rect.width, height: rect.height }))
        .filter((rect) => rect.top < box.height && rect.top + rect.height > 0)
      return rects.length ? [{ annotation: item, rects }] : []
    }))
  }, [content, annotations, current, layout, size, editable, fitsViewport, inComposition])

  useLayoutEffect(() => {
    if (!fitsViewport || inComposition) { setSelectionRects([]); return }
    const root = editable ? editor.current : reading.current
    const changed = () => {
      const item = annotationEditor?.annotation
      const selected = item
        ? { anchor: domOffset(content, item.start), focus: domOffset(content, item.end) }
        : paperSelection(root, editable)
      if (!selected || selected.anchor === selected.focus) { setSelectionRects([]); return }
      const box = paperWindow.current.getBoundingClientRect()
      setSelectionRects(paperTextRects(root, Math.min(selected.anchor, selected.focus), Math.max(selected.anchor, selected.focus), editable)
        .map((rect) => ({ left: rect.left - box.left, top: rect.top - box.top, width: rect.width, height: rect.height }))
        .filter((rect) => rect.top < box.height && rect.top + rect.height > 0))
    }
    changed()
    document.addEventListener('selectionchange', changed)
    return () => document.removeEventListener('selectionchange', changed)
  }, [content, annotationEditor, current, layout, size, editable, fitsViewport, inComposition])

  function edit(event) {
    if (disabled || readOnly || composing.current) return
    selection.current = paperSelection(editor.current) || selection.current
    const nextContent = readPaperText(editor.current)
    const before = documentValue.current
    const input = compositionEvent.current || inputEvent.current || { inputType: event?.nativeEvent?.inputType }
    compositionEvent.current = null
    inputEvent.current = null
    const direction = input.inputType === 'historyUndo' ? -1 : input.inputType === 'historyRedo' ? 1 : 0
    const replacesSelection = /^insert/.test(input.inputType) && input.selection && input.selection.anchor !== input.selection.focus
    if (before.content === nextContent && !replacesSelection && !direction) return
    const stack = history.current
    let nextAnnotations
    if (direction) {
      for (let index = stack.index + direction; index >= 0 && index < stack.entries.length; index += direction) {
        if (stack.entries[index].content !== nextContent) continue
        nextAnnotations = stack.entries[index].annotations
        stack.index = index
        break
      }
    }
    if (!nextAnnotations) {
      let hint
      if (input.selection && !direction) {
        hint = {
          start: characterOffset(before.content, Math.min(input.selection.anchor, input.selection.focus)),
          end: characterOffset(before.content, Math.max(input.selection.anchor, input.selection.focus)),
        }
        const removed = characterCount(before.content) - characterCount(nextContent)
        if (hint.start === hint.end && removed > 0) {
          if (/Backward$/.test(input.inputType)) hint.start = Math.max(0, hint.start - removed)
          if (/Forward$/.test(input.inputType)) hint.end += removed
        }
      }
      nextAnnotations = moveAnnotations(before.content, nextContent, before.annotations, hint)
      stack.entries = [...stack.entries.slice(0, stack.index + 1), { content: nextContent, annotations: nextAnnotations }]
      stack.index++
    }
    if (nextAnnotations.length < before.annotations.length) setAnnotationMessage('对应原文已移除，相关批注也已移除。')
    else setAnnotationMessage('')
    documentValue.current = { content: nextContent, annotations: nextAnnotations }
    onChange(nextContent, nextAnnotations)
  }

  function openAnnotation(annotation, rect) {
    if (disabled || composing.current) return
    const box = paperWindow.current.getBoundingClientRect()
    setAnnotationEditor({ annotation, anchor: { left: box.left + rect.left, top: box.top + rect.top, bottom: box.top + rect.top + rect.height } })
  }

  function contextMenu(event) {
    if (!canAnnotate || composing.current) return
    const selected = paperSelection(editor.current)
    if (!selected) return
    const range = annotationSelection(content, selected)
    if (!range) return
    const rects = paperTextRects(editor.current, Math.min(selected.anchor, selected.focus), Math.max(selected.anchor, selected.focus), true)
    const box = paperWindow.current.getBoundingClientRect()
    const rect = rects.find((item) => item.bottom > box.top && item.top < box.bottom)
    if (!rect) return
    event.preventDefault()
    selection.current = selected
    const existing = annotations.find((item) => item.start < range.end && item.end > range.start)
    setAnnotationMessage(existing ? '选中的文字已有批注，可以在这里修改。' : '')
    openAnnotation(existing || range, { left: rect.left - box.left, top: rect.top - box.top, height: rect.height })
  }

  function closeAnnotation() {
    selection.current = { anchor: selection.current.focus, focus: selection.current.focus }
    const root = editable ? editor.current : reading.current
    if (paperSelection(root, editable)) {
      const selected = root.ownerDocument.getSelection()
      selected.collapse(selected.focusNode, selected.focusOffset)
    }
    setSelectionRects([])
    setAnnotationEditor(null)
    // Native dialog removal can clear the caret after restoring editor focus.
    cancelAnimationFrame(restoreFrame.current)
    restoreFrame.current = requestAnimationFrame(() => {
      restoreFrame.current = null
      if (editable && !readOnly && editor.current && document.activeElement === editor.current) {
        selectPaperText(editor.current, selection.current.anchor, selection.current.focus)
      }
    })
  }

  function saveAnnotations(next) {
    if (!canAnnotate) return
    const value = { content, annotations: next }
    documentValue.current = value
    history.current.entries = history.current.entries.slice(0, history.current.index + 1)
    history.current.entries[history.current.index] = value
    onAnnotationsChange(next)
    closeAnnotation()
    setAnnotationMessage('')
  }

  function clickAnnotation(event) {
    if (disabled || composing.current || !pointer.current || pointer.current.moved || event.shiftKey || event.detail !== 1) return
    pointer.current = null
    const box = paperWindow.current.getBoundingClientRect()
    const x = event.clientX - box.left, y = event.clientY - box.top
    for (const mark of marks) {
      const rect = mark.rects.find((item) => x >= item.left && x <= item.left + item.width && y >= item.top && y <= item.top + item.height)
      if (rect) { openAnnotation(mark.annotation, rect); return }
    }
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
      cancelAnimationFrame(restoreFrame.current)
      if (editable && !readOnly && event.target === editor.current && !paperSelection(editor.current)) selectPaperText(editor.current, selection.current.anchor, selection.current.focus)
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
        <div className="paper-window" ref={paperWindow} style={{ height: layout.pageHeight }} onContextMenu={contextMenu} onClick={clickAnnotation}
          onPointerDown={(event) => {
            cancelAnimationFrame(restoreFrame.current)
            pointer.current = { x: event.clientX, y: event.clientY, moved: false }
          }}
          onPointerMove={(event) => {
            if (pointer.current && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 4) pointer.current.moved = true
          }}
          onPointerCancel={() => { pointer.current = null }}
        >
          <div className="annotation-marks" aria-hidden="true">
            {marks.flatMap((mark) => mark.rects.map((rect, index) => (
              <span key={`${mark.annotation.id}-${index}`} className="annotation-highlight" style={highlightBand(rect)} />
            )))}
            {selectionRects.map((rect, index) => (
              <span key={`selection-${index}`} className="paper-selection-mark" style={highlightBand(rect)} />
            ))}
          </div>
          {marks.map((mark) => (
            <button key={mark.annotation.id} type="button" className="annotation-focus" style={mark.rects[0]} disabled={disabled}
              aria-label={`批注：${mark.annotation.quote}`} onClick={(event) => { event.stopPropagation(); openAnnotation(mark.annotation, mark.rects[0]) }} />
          ))}
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
              onFocus={() => { if (!readOnly) selectPaperText(editor.current, selection.current.anchor, selection.current.focus) }}
              onCompositionStart={() => {
                compositionEvent.current = { inputType: 'insertCompositionText', selection: paperSelection(editor.current) }
                composing.current = true
                setInComposition(true)
              }}
              onCompositionEnd={() => { composing.current = false; setInComposition(false); edit() }}
              style={{ minHeight: layout.pageHeight, transform: `translateY(-${current * layout.pageHeight}px)` }}
            />
          ) : (
            <div ref={reading} lang="zh-CN" className="paper-text paper-reading" style={{ transform: `translateY(-${current * layout.pageHeight}px)` }}>{content || '（照片）'}</div>
          )}
        </div>
      </div>
      <footer className="paper-pagination">
        <button type="button" className="paper-turn paper-previous" aria-label="上一页" disabled={disabled || current === 0} onClick={() => flip(-1)}><svg viewBox="0 0 16 24" aria-hidden="true"><path d="m10 5-6 7 6 7" /></svg></button>
        <output aria-live="polite" aria-label="信纸页码">{current + 1} / {layout.count}</output>
        <button type="button" className="paper-turn paper-next" aria-label="下一页" disabled={disabled || current === layout.count - 1} onClick={() => flip(1)}><svg viewBox="0 0 16 24" aria-hidden="true"><path d="m6 5 6 7-6 7" /></svg></button>
      </footer>
      {annotationMessage && <p role="status" className="annotation-message">{annotationMessage}</p>}
      {annotationEditor && <AnnotationPopover
        annotation={annotationEditor.annotation}
        anchor={annotationEditor.anchor}
        editable={canAnnotate}
        onClose={closeAnnotation}
        onSave={(note) => {
          const item = { ...annotationEditor.annotation, id: annotationEditor.annotation.id || crypto.randomUUID(), note }
          saveAnnotations([...annotations.filter((entry) => entry.id !== item.id), item].sort((a, b) => a.start - b.start))
        }}
        onDelete={() => saveAnnotations(annotations.filter((entry) => entry.id !== annotationEditor.annotation.id))}
      />}
    </section>
  )
}
