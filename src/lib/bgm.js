import { useSyncExternalStore } from 'react'

const defaultSource = '/bgm.mp3'
let audio = null
let playing = false
let request = 0
const listeners = new Set()

function ensure(source) {
  if (audio?.getAttribute('src') === source) return audio
  stopBgm()
  audio = new Audio(source)
  audio.loop = true
  audio.volume = 0.32
  const current = audio
  audio.addEventListener('error', () => { if (audio === current) setPlaying(false) })
  return audio
}

function setPlaying(next) {
  if (playing === next) return
  playing = next
  listeners.forEach((listener) => listener())
}

export async function startBgm(source = audio?.getAttribute('src') || defaultSource) {
  const a = ensure(source)
  const token = ++request
  a.currentTime = 0
  setPlaying(true)
  try {
    await a.play()
    return token === request
  } catch {
    if (token === request) setPlaying(false)
    return false
  }
}

export function stopBgm() {
  request++
  setPlaying(false)
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}

export function resetBgm() {
  stopBgm()
  audio?.removeAttribute('src')
  audio?.load()
  audio = null
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
