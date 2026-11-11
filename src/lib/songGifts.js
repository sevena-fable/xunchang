import { supabase } from './supabase'

const bucket = supabase.storage.from('song-gifts')
export const audioTypes = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' }
export const maxAudioBytes = 6 * 1024 * 1024

function validateAudio(source, objectUrl = false) {
  return new Promise((resolve, reject) => {
    const audio = new Audio()
    const finish = (error) => {
      clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.onerror = null
      audio.removeAttribute('src')
      audio.load()
      if (objectUrl) URL.revokeObjectURL(source)
      if (error) reject(new Error(error))
      else resolve()
    }
    const timer = setTimeout(() => finish('读取音频超时，请换一个链接或直接上传文件。'), 8000)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? null : '请选择一首可播放的音频。')
    audio.onerror = () => finish('无法播放这段音频。请使用音频直链或上传文件，音乐平台的分享页面不能直接播放。')
    audio.src = source
  })
}

export async function sendSongGift({ pair, userId, file, link }) {
  const id = crypto.randomUUID()
  const gift = { id, pair_id: pair.id, sender_id: userId, audio_url: null, storage_path: null }
  if (file) {
    const extension = file.name.toLowerCase().split('.').pop()
    const contentType = audioTypes[extension]
    if (!Object.hasOwn(audioTypes, extension)) throw new Error('请选择 MP3、M4A、WAV 或 OGG 文件。')
    if (!file.size || file.size > maxAudioBytes) throw new Error('音频文件须大于 0 且不超过 6 MB。')
    await validateAudio(URL.createObjectURL(file), true)
    gift.storage_path = `${pair.id}/${userId}/${id}.${extension}`
    const { error } = await bucket.upload(gift.storage_path, file, { contentType })
    if (error) throw error
  } else {
    let url
    try { url = new URL(link.trim()) } catch { throw new Error('请输入完整的 HTTPS 音频直链。') }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
      throw new Error('请使用不含账号密码的 HTTPS 音频直链。')
    }
    await validateAudio(url.href)
    gift.audio_url = url.href
  }
  const { error, status } = await supabase.from('song_gifts').insert(gift).abortSignal(AbortSignal.timeout(12000))
  if (error) {
    if (gift.storage_path && status >= 400 && status < 500) {
      await bucket.remove([gift.storage_path]).catch(() => {})
    }
    throw error
  }
}

export async function loadSongGift(pairId, partnerId, signal) {
  const { data, error } = await supabase.from('song_gifts')
    .select('id,created_at,audio_url,storage_path').eq('pair_id', pairId).eq('sender_id', partnerId)
    .is('seen_at', null).order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(1).maybeSingle().abortSignal(signal)
  if (error) throw error
  if (!data || data.audio_url) return data
  const { data: signed, error: signingError } = await bucket.createSignedUrl(data.storage_path, 60 * 60 * 12)
  return { ...data, audio_url: signingError ? null : signed.signedUrl }
}

export async function acknowledgeSongGift(pairId, partnerId, gift) {
  const { error } = await supabase.from('song_gifts').update({ seen_at: new Date().toISOString() })
    .eq('pair_id', pairId).eq('sender_id', partnerId).is('seen_at', null)
    .or(`created_at.lt.${gift.created_at},and(created_at.eq.${gift.created_at},id.lte.${gift.id})`)
    .abortSignal(AbortSignal.timeout(8000))
  if (error) throw error
}
