import { useSyncExternalStore } from 'react'

let audio = null
let playing = false
const listeners = new Set()

function ensure() {
  if (audio) return audio
  audio = new Audio('/bgm.mp3')
  audio.loop = true
  audio.volume = 0.32
  audio.addEventListener('error', () => setPlaying(false))
  return audio
}

function setPlaying(next) {
  if (playing === next) return
  playing = next
  listeners.forEach((listener) => listener())
}

export function startBgm() {
  const a = ensure()
  a.currentTime = 0
  setPlaying(true)
  a.play().catch(() => setPlaying(false))
}

export function stopBgm() {
  setPlaying(false)
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}

export function toggleBgm() {
  if (playing) stopBgm()
  else startBgm()
}

export function useBgmPlaying() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, () => playing)
}
