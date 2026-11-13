import { useSyncExternalStore } from 'react'

const defaultSource = '/bgm.mp3'
let audio = null
let playing = false
let request = 0
let playlist = [defaultSource]
let track = 0
const listeners = new Set()

function ensure() {
  if (audio) return audio
  audio = new Audio()
  audio.volume = 0.32
  const current = audio
  audio.addEventListener('ended', () => {
    if (audio === current && playing && current.ended && playlist.length > 1) {
      playTrack((track + 1) % playlist.length)
    }
  })
  audio.addEventListener('error', () => {
    if (audio === current && playing && current.error) setPlaying(false)
  })
  return audio
}

function setPlaying(next) {
  if (playing === next) return
  playing = next
  listeners.forEach((listener) => listener())
}

function selectPlaylist(source) {
  playlist = Array.isArray(source) ? source : [source]
  track = 0
}

export function prepareBgm(source = defaultSource) {
  stopBgm()
  selectPlaylist(source)
}

export function startBgm(source) {
  if (source !== undefined) selectPlaylist(source)
  return playTrack(track)
}

async function playTrack(index, remaining = playlist.length) {
  const a = ensure()
  const token = ++request
  track = index
  a.loop = playlist.length === 1
  const source = playlist[index]
  if (a.getAttribute('src') !== source) a.src = source
  else a.currentTime = 0
  try {
    await a.play()
    if (token !== request) return false
    setPlaying(true)
    return true
  } catch {
    if (token !== request) return false
    if (a.error && remaining > 1) return playTrack((index + 1) % playlist.length, remaining - 1)
    setPlaying(false)
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
  selectPlaylist(defaultSource)
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
