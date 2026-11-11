import { useEffect, useRef, useState } from 'react'
import { PrimaryButton } from './Panel'
import SongCatalogSearch from './SongCatalogSearch'

function songName(song, index) {
  if (song.title) return song.title
  if (!song.audio_url) return `已上传的音频 ${index + 1}`
  try {
    const url = new URL(song.audio_url)
    return decodeURIComponent(url.pathname.split('/').at(-1)) || url.hostname
  } catch {
    return `音频链接 ${index + 1}`
  }
}

export default function SongGiftForm({ busy, pair, userId, actions, runAction }) {
  const picker = useRef(null)
  const [songs, setSongs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [link, setLink] = useState('')
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState('')
  const [catalogPending, setCatalogPending] = useState(null)
  const [catalogError, setCatalogError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    actions.list(pair, userId, AbortSignal.timeout(8000)).then((data) => {
      if (active) setSongs(data)
    }, () => {
      if (active) setLoadError(true)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [actions, pair.id, userId, attempt])

  const disabled = busy || loading
  function add(inputs) {
    if (disabled || !inputs.length) return
    return runAction(async () => {
      const failures = []
      try {
        for (const input of inputs) {
          const name = input.file?.name || '音频链接'
          setPending(name)
          try {
            const song = await actions.send({ ...input, pair, userId })
            setSongs((current) => [...current, song])
          } catch (error) {
            failures.push(`${name}：${error.message}`)
          }
        }
        if (failures.length) throw new Error(failures.join('；'))
      } finally {
        setPending('')
      }
    }, inputs.length === 1 ? '已添加到留歌列表' : `已添加 ${inputs.length} 首歌`)
  }

  function drop(event) {
    event.preventDefault()
    setDragging(false)
    const transfer = event.dataTransfer
    if (transfer.files.length) {
      add(Array.from(transfer.files, (file) => ({ file })))
      return
    }
    const url = transfer.getData('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#'))
      || transfer.getData('text/plain').trim()
    if (url) add([{ link: url }])
  }

  async function submitLink(event) {
    event.preventDefault()
    if (link.trim() && await add([{ link }])) setLink('')
  }

  function remove(song) {
    runAction(async () => {
      await actions.remove(pair, userId, song)
      setSongs((current) => current.filter((item) => item.id !== song.id))
    }, '已移除')
  }

  async function addFromCatalog(track) {
    let saved
    const success = await runAction(async () => {
      setCatalogError('')
      setCatalogPending(track.id)
      setPending(track.title)
      try {
        saved = await actions.addFromCatalog(pair, track)
        setSongs((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved])
      } catch (error) {
        setCatalogError(error.name === 'TimeoutError' ? '保存超时，请重新点击添加。' : error.message)
        throw error
      } finally {
        setCatalogPending(null)
        setPending('')
      }
    }, '已添加到留歌列表')
    if (success) return saved
  }

  return (
    <div className="panel-box my-5 space-y-3 px-4 py-3 text-sm">
      <h4 className="font-semibold">给对方留一首歌</h4>
      <SongCatalogSearch pair={pair} search={actions.search} add={addFromCatalog} disabled={disabled}
        pending={catalogPending} savedSongs={songs} />
      {catalogError && <p role="alert" className="text-xs">{catalogError}</p>}
      <div
        className={`space-y-2 rounded-xl border border-dashed px-3 py-3 ${dragging ? 'border-current bg-[var(--panel-soft)]' : 'border-[var(--panel-muted)]'}`}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
        onDrop={drop}
      >
        <p>拖入音频文件或音频链接</p>
        <input ref={picker} type="file" accept=".mp3,.m4a,.wav,.ogg" multiple hidden onChange={(event) => {
          const files = Array.from(event.target.files, (file) => ({ file }))
          event.target.value = ''
          add(files)
        }} />
        <button type="button" className="panel-link" disabled={disabled} onClick={() => picker.current.click()}>选择音频文件</button>
        <p className="text-xs text-[var(--panel-muted)]">自动保存，每首最多 6 MB。</p>
      </div>
      <form onSubmit={submitLink} className="space-y-2">
        <label className="block text-xs text-[var(--panel-muted)]">或粘贴 HTTPS 音频直链
        <input type="url" value={link} maxLength={2048} disabled={disabled} placeholder="https://…"
          onChange={(event) => setLink(event.target.value)} className="panel-input mt-2" />
        </label>
        {link.trim() && <PrimaryButton type="submit" disabled={disabled}>添加链接</PrimaryButton>}
      </form>
      {loading && <p role="status">正在读取留歌列表…</p>}
      {loadError && <p role="status">留歌列表读取失败。 <button type="button" className="panel-link" disabled={busy} onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
      {songs.length > 0 && <ul aria-label="已留的歌" className="divide-y divide-[var(--panel-soft)]">
        {songs.map((song, index) => {
          const name = songName(song, index)
          return <li key={song.id} className="flex items-center gap-2 py-1">
            <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
            <button type="button" aria-label={`移除 ${name}`} title="移除" disabled={disabled}
              className="size-8 shrink-0 rounded-lg text-[var(--panel-muted)] hover:bg-[var(--panel-soft)]" onClick={() => remove(song)}>×</button>
          </li>
        })}
      </ul>}
      {pending && <p role="status" className="break-all">正在保存 {pending}…</p>}
    </div>
  )
}
