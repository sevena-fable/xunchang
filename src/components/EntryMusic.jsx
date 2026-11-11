import { useEffect, useRef, useState } from 'react'
import Panel, { GhostButton, PrimaryButton } from './Panel'
import { resetBgm, startBgm } from '../lib/bgm'
import { acknowledgeSongGifts, loadSongGifts } from '../lib/songGifts'

export default function EntryMusic({ pairId, partnerId, partnerNickname }) {
  const [open, setOpen] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ loading: true })
  const [starting, setStarting] = useState(false)
  const [playError, setPlayError] = useState('')
  const active = useRef(false)
  const playback = useRef(0)

  useEffect(() => {
    active.current = true
    return () => { active.current = false; playback.current++; resetBgm() }
  }, [])
  useEffect(() => {
    if (!open) return
    if (!partnerId) { setResult({}); return }
    const signal = AbortSignal.timeout(6500)
    let current = true
    const fail = () => { if (current) setResult({ error: true }) }
    signal.addEventListener('abort', fail)
    setResult({ loading: true })
    loadSongGifts(pairId, partnerId, signal).then((gifts) => {
      if (current && !signal.aborted) setResult({ gifts })
    }, fail).finally(() => signal.removeEventListener('abort', fail))
    return () => { current = false; signal.removeEventListener('abort', fail) }
  }, [pairId, partnerId, open, attempt])

  const { gifts = [], loading, error } = result
  const playable = gifts.filter((gift) => gift.url)
  const count = gifts.length
  const unavailable = count - playable.length
  const sender = partnerNickname || '对方'
  function finish(handled) {
    setOpen(false)
    acknowledgeSongGifts(pairId, partnerId, handled.map((gift) => gift.id)).catch(() => {
      // Unacknowledged songs remain available on the next visit.
    })
  }
  function skip() {
    playback.current++
    resetBgm()
    finish(gifts)
  }
  async function play(useGifts) {
    const token = ++playback.current
    setStarting(true)
    setPlayError('')
    const started = await startBgm(useGifts ? playable.map((gift) => gift.url) : '/bgm.mp3')
    if (!active.current || token !== playback.current) return
    setStarting(false)
    if (started) finish(useGifts ? playable : [])
    else {
      resetBgm()
      setPlayError(useGifts ? '暂时无法播放留歌，可以重试或播放原来的背景音乐。' : '音乐暂时无法播放，请重试。')
    }
  }

  return (
    <Panel open={open} title="背景音乐" width="max-w-sm" onClose={skip}
      subtitle={count ? `${sender}给你留了${count === 1 ? '一' : count}首歌，现在要听吗？` : '要播放音乐吗？之后可以在设置里随时开关。'}>
      {loading && <p role="status" className="mb-3 text-sm">正在看看对方有没有留歌…</p>}
      {error && <p role="status" className="mb-3 text-sm">暂时无法检查留歌。 <button className="panel-link" onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
      {unavailable > 0 && <p role="status" className="mb-3 text-sm">有 {unavailable} 首歌暂时无法读取。 <button className="panel-link" disabled={starting} onClick={() => { setPlayError(''); setAttempt((value) => value + 1) }}>重试</button></p>}
      {playError && <p role="alert" className="mb-3 text-sm">{playError}</p>}
      <div className="panel-actions flex-wrap">
        <GhostButton onClick={skip}>先不听</GhostButton>
        {count > 0 && (playError || !playable.length) && <GhostButton disabled={starting} onClick={() => play(false)}>播放原背景音乐</GhostButton>}
        {(!count || playable.length > 0) && <PrimaryButton disabled={loading || starting} onClick={() => play(count > 0)}>
          {starting ? '正在播放…' : count > 1 ? '听这些歌' : count === 1 ? '听这首' : '播放'}
        </PrimaryButton>}
      </div>
    </Panel>
  )
}
