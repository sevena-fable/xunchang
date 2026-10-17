import { useEffect, useRef, useState } from 'react'
import { getStationery } from '../lib/stationery'
import { acquireDraft, clearDraft, draftKey, emptyDraft, loadDraft, saveDraft } from '../lib/drafts'
import Modal from './Modal'
import Panel, { PrimaryButton } from './Panel'
import PaperSheet, { PaperWorkspace, usePaperViewport } from './PaperSheet'
import { selectPaperText } from '../lib/paper'
import { sfxPaper, sfxSeal } from '../lib/sfx'

const STYLE = getStationery('cream')
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export default function WriteLetter({ open, onClose, pair, userId, onDone, onSend, environment = 'live' }) {
  const key = draftKey(environment, userId, pair.id)
  const fitsViewport = usePaperViewport()
  const [draft, setDraft] = useState(emptyDraft)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState('')
  const [draftError, setDraftError] = useState('')
  const [thumbnails, setThumbnails] = useState([])
  const [previewId, setPreviewId] = useState(null)
  const [showSource, setShowSource] = useState(false)
  const fileRef = useRef(null)
  const inputRef = useRef(null)
  const sending = useRef(false)
  const version = useRef(0)
  const alive = useRef(false)
  const editor = useRef(null)
  const dirty = useRef(false)
  const closing = useRef(false)
  const acquisition = useRef(0)
  const [access, setAccess] = useState('checking')
  const [accessMessage, setAccessMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const [closingPaper, setClosingPaper] = useState(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      editor.current?.release()
      editor.current = null
    }
  }, [key])

  useEffect(() => {
    if (!open || editor.current) return
    let active = true
    const attempt = ++acquisition.current
    const current = () => active && attempt === acquisition.current
    setDraft(emptyDraft())
    setReady(false)
    setAccess('checking')
    setAccessMessage('正在确认草稿编辑权限…')
    setMessage('')
    setDraftError('')
    setSaved('')
    async function acquire() {
      let session
      try {
        session = await acquireDraft(key)
        if (!current()) { session?.release(); return }
        const value = await (session ? session.run(() => loadDraft(key)) : loadDraft(key))
        if (!current()) { session?.release(); return }
        editor.current = session
        dirty.current = false
        setDraft(value)
        setAccess(session ? 'editing' : 'blocked')
        setAccessMessage(session ? '' : '草稿正在另一个窗口编辑或尚未保存，此处只读。')
        if (session) setSaved(value.attempted ? '上次分享尚待确认，可重试确认' : '草稿保存在这台电脑')
      } catch (error) {
        session?.release()
        if (current()) {
          setAccess('unavailable')
          setAccessMessage('暂不能编辑草稿：' + error.message)
        }
      } finally { if (current()) setReady(true) }
    }
    acquire()
    return () => { active = false }
  }, [key, open, retry])

  useEffect(() => {
    const urls = draft.attachments.map((item) => ({ id: item.id, url: URL.createObjectURL(item.file) }))
    setThumbnails(urls)
    return () => urls.forEach((item) => URL.revokeObjectURL(item.url))
  }, [draft.attachments])

  function persist(next) {
    const session = editor.current
    if (!session) return Promise.reject(new Error('请先取得草稿编辑权限'))
    setDraft(next)
    dirty.current = true
    const revision = ++version.current
    setSaved('正在保存…')
    return session.run(() => saveDraft(key, next)).then(() => {
      if (alive.current && editor.current === session && revision === version.current) {
        dirty.current = false
        setSaved('草稿已保存在这台电脑')
        setDraftError('')
      }
    }).catch(() => {
      if (alive.current && editor.current === session && revision === version.current) { setSaved(''); setDraftError('草稿未保存，请勿刷新或关闭页面') }
      throw new Error('草稿保存失败')
    })
  }

  function edit(next) {
    if (locked || closing.current || !editor.current) return
    setMessage('')
    persist(next).catch(() => {})
  }

  function pickImages(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (locked || closing.current || !files.length) return
    if (files.length + draft.attachments.length > 3) { setMessage('一次最多分享三张照片'); return }
    if (files.some((file) => !IMAGE_TYPES.includes(file.type) || file.size > 6 * 1024 * 1024)) {
      setMessage('请选择 JPG、PNG、WebP 或 GIF，每张不超过 6MB')
      return
    }
    edit({ ...draft, attachments: [...draft.attachments, ...files.map((file) => ({ id: crypto.randomUUID(), file }))] })
    setMessage('')
    sfxPaper()
  }

  const empty = !draft.content.trim() && !draft.attachments.length

  async function send() {
    const session = editor.current
    if (!session || access !== 'editing' || sending.current || closing.current || !ready || empty) return
    sending.current = true
    setBusy(true)
    setMessage('')
    const snapshot = { ...draft, attempted: true }
    try {
      await persist(snapshot)
      const cleanupFailed = await session.run(async () => {
        await onSend({ ...snapshot, pairId: pair.id, userId })
        try { await clearDraft(key); return false } catch { return true }
      })
      if (!alive.current || editor.current !== session) return
      ++version.current
      dirty.current = cleanupFailed
      setDraft(emptyDraft())
      setSaved('')
      setMessage(cleanupFailed ? '已分享，但本机旧草稿清理失败；重复确认不会再次分享' : '对方可以看到了')
      setBusy(false)
      sending.current = false
      sfxSeal()
      onDone()
    } catch (error) {
      if (!alive.current || editor.current !== session) return
      setMessage('尚未确认分享成功：' + error.message)
      if (error.confirmedNotSent || error.message === '草稿保存失败') persist({ ...snapshot, attempted: false }).catch(() => {})
      setBusy(false)
      sending.current = false
    }
  }

  const locked = !ready || access !== 'editing' || busy || closingPaper || draft.attempted
  const previewPhoto = thumbnails.find((item) => item.id === previewId)
  function insertSource(source) {
    if (locked) return
    const separator = !draft.content || draft.content.endsWith('\n\n') ? '' : draft.content.endsWith('\n') ? '\n' : '\n\n'
    const content = `${draft.content}${separator}出处：${source}`
    edit({ ...draft, content })
    setShowSource(false)
    requestAnimationFrame(() => {
      if (!inputRef.current) return
      inputRef.current.focus({ preventScroll: true })
      selectPaperText(inputRef.current, content.length)
    })
  }
  const close = async () => {
    if (sending.current || closing.current) return
    closing.current = true
    ++acquisition.current
    setClosingPaper(true)
    const session = editor.current
    await session?.flush()
    if (!alive.current) return
    if (editor.current === session && !dirty.current) {
      editor.current = null
      session?.release()
    }
    setPreviewId(null)
    setShowSource(false)
    onClose()
    closing.current = false
    setClosingPaper(false)
  }
  return (
    <Modal open={open} onClose={close} label="给你看看" closeOnBackdrop={false}>
      <PaperWorkspace fitsViewport={fitsViewport} onClose={close} disabled={busy || closingPaper}>
        <PaperSheet inputRef={inputRef} style={STYLE} content={draft.content} onChange={(content) => edit({ ...draft, content })} header="给你看看" onClose={close} disabled={busy || closingPaper} readOnly={!ready || access !== 'editing' || draft.attempted} />
        <div className="letter-tools">
          <div className="attachment-tray">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={locked || draft.attachments.length >= 3}>加照片</button>
            <input ref={fileRef} type="file" aria-label="选择照片" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={pickImages} />
            {thumbnails.map((item, index) => (
              <div key={item.id} className="attachment-item">
                <button type="button" className="preview-photo" aria-label={`预览照片 ${index + 1}`} disabled={busy} onClick={() => setPreviewId(item.id)}><img src={item.url} alt={`附件 ${index + 1}`} /></button>
                <button type="button" className="remove-photo" aria-label={`移除附件 ${index + 1}`} disabled={locked} onClick={() => edit({ ...draft, attachments: draft.attachments.filter((photo) => photo.id !== item.id) })}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => setShowSource(true)} disabled={locked}>加出处</button>
          </div>
          <button type="button" className="send-button" onClick={send} disabled={busy || closingPaper || !ready || access !== 'editing' || empty}>{busy ? '正在分享…' : draft.attempted ? '确认上次分享' : '分享给对方'}</button>
        </div>
        <div className="letter-status">
          {draftError && <p role="alert">{draftError}</p>}
          <p role="status">{accessMessage || message || (!draftError && saved)}{(access === 'blocked' || access === 'unavailable') && <button type="button" className="ml-3 underline" disabled={closingPaper} onClick={() => setRetry((value) => value + 1)}>重试编辑</button>}</p>
        </div>
      </PaperWorkspace>
      {previewPhoto && <Modal onClose={() => setPreviewId(null)} label="预览照片"><div className="photo-panel panel-card"><img src={previewPhoto.url} alt="分享前的完整照片" /><button type="button" className="panel-ghost" onClick={() => setPreviewId(null)}>关闭照片</button></div></Modal>}
      {showSource && <SourcePanel onClose={() => setShowSource(false)} onInsert={insertSource} />}
    </Modal>
  )
}

function SourcePanel({ onClose, onInsert }) {
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const source = [title.trim(), location.trim()].filter(Boolean).join(' · ')
  return (
    <Panel open title="加出处" subtitle="选填，附在正文末尾，可直接修改或删除。" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <label className="block text-[var(--panel-muted)]">作品与作者
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="panel-input mt-2" />
        </label>
        <label className="block text-[var(--panel-muted)]">链接或页码
          <input value={location} onChange={(event) => setLocation(event.target.value)} className="panel-input mt-2" />
        </label>
        <div className="panel-actions">
          <button type="button" onClick={onClose} className="panel-link">取消</button>
          <PrimaryButton type="button" disabled={!source} onClick={() => onInsert(source)}>插入正文</PrimaryButton>
        </div>
      </div>
    </Panel>
  )
}
