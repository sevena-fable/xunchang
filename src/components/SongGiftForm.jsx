import { useRef, useState } from 'react'
import { PrimaryButton } from './Panel'

export default function SongGiftForm({ busy, onSend }) {
  const picker = useRef(null)
  const [file, setFile] = useState(null)
  const [link, setLink] = useState('')
  const [dragging, setDragging] = useState(false)

  function chooseFile(next) {
    if (next) { setFile(next); setLink('') }
    if (picker.current) picker.current.value = ''
  }

  function drop(event) {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    const transfer = event.dataTransfer
    if (transfer.files.length) chooseFile(transfer.files[0])
    else {
      const url = transfer.getData('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#'))
        || transfer.getData('text/plain').trim()
      if (url) { setLink(url); setFile(null) }
    }
  }

  async function send(event) {
    event.preventDefault()
    if (await onSend({ file, link })) { setFile(null); setLink('') }
  }

  return (
    <form onSubmit={send} className="panel-box my-5 space-y-3 px-4 py-3 text-sm">
      <h4 className="font-semibold">给对方留一首歌</h4>
      <p className="text-xs text-[var(--panel-muted)]">对方下次来到桌前时，可以选择听你留下的歌。</p>
      <div
        className={`space-y-2 rounded-xl border border-dashed px-3 py-3 ${dragging ? 'border-current bg-[var(--panel-soft)]' : 'border-[var(--panel-muted)]'}`}
        onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true) }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
        onDrop={drop}
      >
        <p className="break-all">{file ? file.name : '拖入音频文件或音频链接'}</p>
        <input ref={picker} type="file" accept=".mp3,.m4a,.wav,.ogg" hidden onChange={(event) => chooseFile(event.target.files[0])} />
        <button type="button" className="panel-link" disabled={busy} onClick={() => picker.current.click()}>选择音频文件</button>
        {file && <button type="button" className="panel-link ml-4" disabled={busy} onClick={() => setFile(null)}>移除</button>}
        <p className="text-xs text-[var(--panel-muted)]">MP3、M4A、WAV 或 OGG，最大 6 MB。</p>
      </div>
      <label className="block text-xs text-[var(--panel-muted)]">或粘贴 HTTPS 音频直链
        <input type="url" value={link} maxLength={2048} disabled={busy} placeholder="https://…"
          onChange={(event) => { setLink(event.target.value); setFile(null) }} className="panel-input mt-2" />
      </label>
      <PrimaryButton type="submit" disabled={busy || (!file && !link.trim())}>留下这首歌</PrimaryButton>
    </form>
  )
}
