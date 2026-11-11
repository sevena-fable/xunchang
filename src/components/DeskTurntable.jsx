import { useEffect, useState } from 'react'
import { toggleBgm, useBgmPlaying } from '../lib/bgm'

export default function DeskTurntable() {
  const playing = useBgmPlaying()
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (playing) setShown(true)
  }, [playing])

  if (!shown && !playing) return null

  return (
    <button type="button" className="desk-turntable" aria-label="唱片播放器"
      aria-pressed={playing} title={playing ? '停止音乐' : '播放音乐'} onClick={toggleBgm}>
      <span className="desk-turntable-disc" aria-hidden="true" />
      <span className="desk-turntable-arm" aria-hidden="true" />
      <span className="desk-turntable-light" aria-hidden="true" />
    </button>
  )
}
