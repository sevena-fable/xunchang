import { useCallback, useEffect, useRef, useState } from 'react'
import { getStationery } from '../lib/stationery'
import { REACTIONS, reactionOf } from '../lib/letterFormat'
import PaperSheet, { PaperWorkspace, usePaperViewport } from './PaperSheet'
import Modal from './Modal'
import Panel, { PrimaryButton } from './Panel'
import { sfxReact } from '../lib/sfx'

export default function ReadLetter({ letter, userId, reaction, reactionLoading = false, reactionError = '', onRetryReactions, onClose, onChanged, onMarkRead, onDeliver, onReact, resolveImages }) {
  const style = getStationery(letter.stationery)
  const mine = letter.sender_id === userId
  const sealed = mine && ['sealed', 'delivering'].includes(letter.status)
  const fitsViewport = usePaperViewport()
  const [message, setMessage] = useState('')
  const [readFailed, setReadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  // 同一条内容的附件不可修改，状态刷新不应使已打开的照片失效。
  const [imageSources] = useState(() => letter.images || [])
  const [images, setImages] = useState([])
  const canLoadImages = fitsViewport || images.length > 0
  const [imageError, setImageError] = useState('')
  const [imageRetry, setImageRetry] = useState(0)
  const [zoom, setZoom] = useState(null)
  const [showReaction, setShowReaction] = useState(false)
  const [confirmDelivery, setConfirmDelivery] = useState(false)
  const [delivered, setDelivered] = useState(false)
  const alive = useRef(false)
  const lock = useRef(false)
  const readRequested = useRef(null)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    if (!canLoadImages || !imageSources.length) return
    let active = true
    let urls = []
    setImageError('')
    resolveImages(imageSources).then((result) => {
      urls = result
      if (active) setImages(result)
      else result.forEach(URL.revokeObjectURL)
    }).catch((error) => { if (active) setImageError('照片读取失败：' + error.message) })
    return () => { active = false; urls.forEach(URL.revokeObjectURL) }
  }, [canLoadImages, imageSources, resolveImages, imageRetry])

  const markRead = useCallback(async () => {
    try {
      await onMarkRead(letter)
      if (alive.current) { setReadFailed(false); setMessage(''); onChanged() }
    } catch (error) {
      if (alive.current) { setReadFailed(true); setMessage('已读状态未保存：' + error.message) }
    }
  }, [letter, onMarkRead, onChanged])

  useEffect(() => {
    if (!fitsViewport || mine || letter.status !== 'delivered' || readRequested.current === letter.id) return
    readRequested.current = letter.id
    markRead()
  }, [fitsViewport, mine, letter.id, letter.status, markRead])

  async function deliver() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    try {
      await onDeliver(letter)
      if (alive.current) { setDelivered(true); setConfirmDelivery(false); setMessage('已分享'); onChanged() }
    } catch (error) { if (alive.current) setMessage('分享失败：' + error.message) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }

  const close = () => { if (!lock.current) onClose() }
  const date = new Date(letter.sealed_at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const header = `${mine ? sealed && !delivered ? '还未分享的内容' : '你分享的内容' : '对方分享的内容'} · ${date}`
  return (
    <Modal onClose={close} label="查看内容" closeOnBackdrop={false}>
      <PaperWorkspace fitsViewport={fitsViewport} onClose={close} disabled={busy}>
        <PaperSheet style={style} content={letter.content} annotations={letter.annotations} header={header} onClose={close} disabled={busy} />
        <div className="letter-tools">
          <div className="attachment-tray">
            {images.map((url, index) => <button type="button" key={url} aria-label={`查看照片 ${index + 1}`} onClick={() => setZoom(url)} style={{ padding: 0, border: 0 }}><img src={url} alt={`分享的照片 ${index + 1}`} /></button>)}
            {imageError && <button type="button" onClick={() => setImageRetry((value) => value + 1)}>重新读取照片</button>}
          </div>
          {sealed && !delivered ? (
            <button type="button" disabled={busy} onClick={() => setConfirmDelivery(true)}>分享给对方</button>
          ) : (
            <button type="button" onClick={() => setShowReaction(true)}>{reaction ? '查看回应' : mine ? '回应' : '留个回应'}</button>
          )}
        </div>
        <p className="letter-status" role="status">{message || imageError}{readFailed && <button type="button" className="ml-3 underline" onClick={markRead}>重试保存</button>}</p>
      </PaperWorkspace>
      {zoom && <Modal onClose={() => setZoom(null)} label="查看照片"><div className="photo-panel panel-card"><img src={zoom} alt="放大的照片" /><button type="button" className="panel-ghost" onClick={() => setZoom(null)}>关闭照片</button></div></Modal>}
      <Panel open={confirmDelivery} onClose={() => { if (!busy) setConfirmDelivery(false) }} title="分享给对方">
        <p className="mb-5 text-sm">分享后对方就能看到，内容不能再修改。</p>
        <PrimaryButton disabled={busy} onClick={deliver}>{busy ? '正在分享…' : '确认分享'}</PrimaryButton>
        <p role="status" className="mt-3 text-sm">{message}</p>
      </Panel>
      {showReaction && <ReactionPanel reaction={reaction} loading={reactionLoading} error={reactionError} onRetry={onRetryReactions} mine={mine} onClose={() => setShowReaction(false)} onSubmit={(value) => onReact({ ...value, letterId: letter.id, pairId: letter.pair_id, userId })} onChanged={onChanged} />}
    </Modal>
  )
}

function ReactionPanel({ reaction, loading, error, onRetry, mine, onClose, onSubmit, onChanged }) {
  const [emoji, setEmoji] = useState('')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const value = reaction || saved
  async function submit() {
    if (lock.current || (!emoji && !note.trim())) return
    if (Array.from(note).length > 20) { setMessage('短评请保持在 20 字以内'); return }
    lock.current = true
    setBusy(true)
    try { await onSubmit({ emoji, note }); setSaved({ emoji, note }); sfxReact(); onChanged() }
    catch (error) { setMessage('回应未送出：' + error.message) }
    finally { lock.current = false; setBusy(false) }
  }
  return (
    <Panel open onClose={() => { if (!lock.current) onClose() }} title={mine ? '对方的回应' : '你的回应'} width="max-w-lg">
      {(loading || error) && <p role="status" className="mb-3 text-sm">{loading ? '正在读取回应…' : error}{error && !loading && <button type="button" className="ml-3 underline" onClick={onRetry}>重试读取回应</button>}</p>}
      {value ? <p className="flex items-center gap-3">{reactionOf(value.emoji) && <img src={reactionOf(value.emoji).icon} alt={reactionOf(value.emoji).label} className="h-12 w-12" />}{value.note && <span>「{value.note}」</span>}</p> : loading || error ? null : mine ? <p className="text-sm">还没有回应。</p> : (
        <>
          <p className="mb-4 text-sm">每条内容可以回应一次，送出后不能修改。</p>
          <div className="panel-reactions">{REACTIONS.map((item) => <button type="button" key={item.key} disabled={busy} aria-pressed={emoji === item.key} onClick={() => setEmoji(emoji === item.key ? '' : item.key)} className="panel-reaction"><img src={item.icon} alt={item.label} /></button>)}</div>
          <input aria-label="回应短评" value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="想说的一句话（20 字以内）" className="panel-input text-sm" />
          <p className="my-2 text-xs text-[var(--panel-muted)]">{Array.from(note).length}/20</p>
          <p role="status" className="mb-3 text-sm">{message}</p>
          <button type="button" onClick={submit} disabled={busy || (!emoji && !note.trim())} className="panel-primary w-full">{busy ? '正在送出…' : '送出回应'}</button>
        </>
      )}
    </Panel>
  )
}
