import { useEffect, useRef, useState } from 'react'
import Panel, { GhostButton, PrimaryButton } from './Panel'
import { resetBgm, startBgm } from '../lib/bgm'
import { acknowledgeSongGift, loadSongGift } from '../lib/songGifts'

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
    loadSongGift(pairId, partnerId, signal).then((gift) => {
      if (current && !signal.aborted) setResult({ gift })
    }, fail).finally(() => signal.removeEventListener('abort', fail))
    return () => { current = false; signal.removeEventListener('abort', fail) }
  }, [pairId, partnerId, open, attempt])

  const { gift, loading, error } = result
  const sender = partnerNickname || '对方'
  function finish() {
    setOpen(false)
    if (gift) acknowledgeSongGift(pairId, partnerId, gift).catch(() => {
      // If acknowledgement fails, the gift remains available on the next visit.
    })
  }
  function skip() {
    playback.current++
    resetBgm()
    finish()
  }
  async function play(source) {
    const token = ++playback.current
    setStarting(true)
    setPlayError('')
    const started = await startBgm(source)
    if (!active.current || token !== playback.current) return
    setStarting(false)
    if (started) finish()
    else {
      resetBgm()
      setPlayError(source ? '暂时播不了这首歌，可以重试或播放原来的背景音乐。' : '音乐暂时无法播放，请重试。')
    }
  }

  return (
    <Panel open={open} title="背景音乐" width="max-w-sm" onClose={skip}
      subtitle={gift ? `${sender}给你留了一首歌，现在要听吗？` : '要播放音乐吗？之后可以在设置里随时开关。'}>
      {loading && <p role="status" className="mb-3 text-sm">正在看看对方有没有留歌…</p>}
      {error && <p role="status" className="mb-3 text-sm">暂时无法检查留歌。 <button className="panel-link" onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
      {gift && !gift.audio_url && <p role="status" className="mb-3 text-sm">这首歌暂时无法读取。 <button className="panel-link" onClick={() => setAttempt((value) => value + 1)}>重试</button></p>}
      {playError && <p role="alert" className="mb-3 text-sm">{playError}</p>}
      <div className="panel-actions flex-wrap">
        <GhostButton onClick={skip}>先不听</GhostButton>
        {gift && (playError || !gift.audio_url) && <GhostButton disabled={starting} onClick={() => play('/bgm.mp3')}>播放原背景音乐</GhostButton>}
        {(!gift || gift.audio_url) && <PrimaryButton disabled={loading || starting} onClick={() => play(gift?.audio_url)}>
          {starting ? '正在播放…' : gift ? '听这首' : '播放'}
        </PrimaryButton>}
      </div>
    </Panel>
  )
}
