import { useEffect, useRef, useState } from 'react'
import { PrimaryButton } from './Panel'

export default function SongCatalogSearch({ pair, search, add, upload, disabled, pending, savedSongs }) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState(null)
  const [added, setAdded] = useState(new Map())
  const [unavailable, setUnavailable] = useState(new Map())
  const request = useRef(null)
  const picker = useRef(null)
  const selected = useRef(null)
  useEffect(() => () => request.current?.abort(), [])

  async function submit(event) {
    event.preventDefault()
    const keyword = query.trim()
    if (!keyword) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ loading: true })
    try {
      const songs = await search(pair, keyword, AbortSignal.any([controller.signal, AbortSignal.timeout(16000)]))
      if (!controller.signal.aborted) setState({ songs })
    } catch (error) {
      if (!controller.signal.aborted) setState({ error: error.name === 'TimeoutError' ? '搜索超时，请再试一次。' : error.message })
    }
  }

  async function choose(song) {
    const { saved, sourceError } = await add(song)
    if (sourceError) setUnavailable((current) => new Map(current).set(song.id, sourceError))
    if (saved) setAdded((current) => new Map(current).set(song.id, saved.id))
  }

  async function chooseFile(event) {
    const file = event.target.files[0]
    event.target.value = ''
    const song = selected.current
    if (!song || !file) return
    const saved = await upload(song, file)
    if (saved) setAdded((current) => new Map(current).set(song.id, saved.id))
  }

  return (
    <div className="space-y-2">
      <input ref={picker} type="file" accept=".mp3,.m4a,.wav,.ogg" hidden onChange={chooseFile} />
      <form onSubmit={submit} className="flex items-center gap-2">
        <input type="search" aria-label="搜索歌曲" placeholder="输入歌名或歌手"
          value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)}
          className="panel-input min-w-0 flex-1" />
        <PrimaryButton type="submit" disabled={!query.trim()} className="shrink-0">搜索</PrimaryButton>
      </form>
      {state?.loading && <p role="status" className="text-xs text-[var(--panel-muted)]">正在搜歌…</p>}
      {state?.error && <p role="alert" className="text-xs">{state.error}</p>}
      {state?.songs?.length === 0 && <p role="status" className="text-xs text-[var(--panel-muted)]">没有找到歌曲，试试歌名或歌手名。</p>}
      {state?.songs?.length > 0 && <ul aria-label="搜歌结果" className="thin-scroll max-h-56 divide-y divide-[var(--panel-soft)] overflow-y-auto rounded-lg border border-[var(--panel-border)] px-2">
        {state.songs.map((song) => {
          const saved = savedSongs.some((item) => item.id === added.get(song.id))
          const sourceError = unavailable.get(song.id)
          return (
          <li key={song.id} className="flex items-center gap-2 py-2 pl-1">
            <div className="min-w-0 flex-1">
              <p className="truncate" title={song.title}>{song.title}</p>
              <p className="truncate text-xs text-[var(--panel-muted)]">{song.artist}{song.date ? ` · ${song.date}` : ''}</p>
              {sourceError && !saved && <p className="mt-1 text-xs text-[var(--panel-muted)]">{sourceError}</p>}
            </div>
            {sourceError && !saved && <button type="button" className="panel-link shrink-0 text-xs" disabled={disabled}
              aria-label={`上传完整版 ${song.title} · ${song.artist}`}
              onClick={() => { selected.current = song; picker.current.click() }}>上传完整版</button>}
            <button type="button" aria-label={`${saved ? '已添加' : '添加'} ${song.title} · ${song.artist}`} disabled={disabled || saved}
              className="size-8 shrink-0 rounded-full bg-[var(--panel-soft)] text-base hover:brightness-95 disabled:opacity-60"
              onClick={() => choose(song)}>
              {pending === song.id ? '…' : saved ? '✓' : '＋'}
            </button>
          </li>
          )
        })}
      </ul>}
    </div>
  )
}
