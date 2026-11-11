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
    gift.title = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 200) || null
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
  const { data, error, status } = await supabase.from('song_gifts').insert(gift)
    .select('id,title,audio_url,storage_path,created_at').single().abortSignal(AbortSignal.timeout(12000))
  if (error) {
    if (gift.storage_path && status >= 400 && status < 500) {
      await bucket.remove([gift.storage_path]).catch(() => {})
    }
    throw error
  }
  return data
}

const pageSize = 100

async function listSongGifts(pairId, senderId, signal, fields) {
  const gifts = []
  while (true) {
    const query = supabase.from('song_gifts')
      .select(fields).eq('pair_id', pairId).eq('sender_id', senderId)
      .order('created_at').order('id').limit(pageSize).abortSignal(signal)
    const last = gifts.at(-1)
    if (last) query.or(`created_at.gt.${last.created_at},and(created_at.eq.${last.created_at},id.gt.${last.id})`)
    const { data, error } = await query
    if (error) throw error
    gifts.push(...data)
    if (data.length < pageSize) break
  }
  return gifts
}

export function listOwnSongGifts(pair, userId, signal) {
  return listSongGifts(pair.id, userId, signal, 'id,title,created_at,audio_url,storage_path')
}

export async function removeSongGift(pair, userId, gift) {
  const { error } = await supabase.from('song_gifts').delete().eq('pair_id', pair.id)
    .eq('sender_id', userId).eq('id', gift.id).abortSignal(AbortSignal.timeout(8000))
  if (error) throw error
  if (gift.storage_path) await bucket.remove([gift.storage_path]).catch(() => {})
}

export async function loadSongGifts(pairId, partnerId, signal) {
  const gifts = await listSongGifts(pairId, partnerId, signal, 'id,created_at,audio_url,storage_path')
  const paths = gifts.flatMap((gift) => gift.storage_path ? [gift.storage_path] : [])
  const urls = new Map()
  for (let index = 0; index < paths.length && !signal.aborted; index += pageSize) {
    const { data } = await bucket.createSignedUrls(paths.slice(index, index + pageSize), 60 * 60 * 12)
    for (const item of data || []) if (item.signedUrl) urls.set(item.path, item.signedUrl)
  }
  return gifts.map((gift) => ({ id: gift.id, url: gift.audio_url || urls.get(gift.storage_path) }))
}

async function catalogRequest(path, options = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('请登录后再搜歌。')
  const response = await fetch(`/api/song-catalog${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) {
    const error = new Error(result?.error || '搜歌服务暂时不可用，请稍后重试。')
    error.code = result?.code
    throw error
  }
  return result
}

async function searchCatalog(pair, query, signal) {
  const params = new URLSearchParams({ pair: pair.id, q: query })
  return (await catalogRequest(`?${params}`, { signal })).songs
}

async function addCatalogSong(pair, track) {
  return (await catalogRequest('', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pair: pair.id, track: track.id }), signal: AbortSignal.timeout(55000),
  })).song
}

export const songGiftActions = {
  list: listOwnSongGifts, send: sendSongGift, remove: removeSongGift,
  search: searchCatalog, addFromCatalog: addCatalogSong,
}
