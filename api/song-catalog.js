import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import ffmpeg from '@ffmpeg-installer/ffmpeg'
import { createClient } from '@supabase/supabase-js'
import { decodeHTML } from 'entities'
import { catalogGiftId } from '../src/lib/catalogGiftId.js'

const run = promisify(execFile)
const origin = 'https://www.163cn.cc'
const columns = 'id,title,audio_url,storage_path,created_at'
const storageLimit = 6 * 1024 * 1024
const songIdPattern = /^\d{1,9}$/
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

class SourceUnavailable extends Error {}

// Studio track duration from the publisher's catalog on Kugou.
const verifiedDurations = new Map([['511', 281.678]])

function clean(html = '') {
  return decodeHTML(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

export function parseSearch(html) {
  const songs = new Map()
  for (const match of html.matchAll(/<a\b[^>]*href="\/songs\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, id, card] = match
    const title = clean(card.match(/<h3>([\s\S]*?)<\/h3>/i)?.[1])
    const artist = clean(card.match(/<div class="s">([\s\S]*?)<\/div>/i)?.[1])
    const date = clean(card.match(/<div class="d">([\s\S]*?)<\/div>/i)?.[1])
    if (title && artist) songs.set(id, { id, title: title.slice(0, 150), artist: artist.slice(0, 100), date })
    if (songs.size === 24) break
  }
  return [...songs.values()]
}

async function providerText(path, options) {
  const response = await fetch(new URL(path, origin), {
    ...options, redirect: 'error', signal: AbortSignal.timeout(9000),
  })
  if (!response.ok) throw new Error('曲库暂时无法连接，请稍后再试。')
  return new TextDecoder().decode(await readBounded(response, 1024 * 1024))
}

async function readBounded(response, maximum) {
  const advertisedSize = Number(response.headers.get('content-length'))
  if (advertisedSize > maximum) {
    await response.body?.cancel()
    throw new Error('音频或曲库响应过大。')
  }
  if (!response.body) throw new Error('音源没有返回内容。')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > maximum) throw new Error('音频或曲库响应过大。')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}

function audioFormat(bytes) {
  if (bytes.toString('ascii', 0, 3) === 'ID3') return 'mp3'
  if (bytes.toString('ascii', 0, 4) === 'fLaC') return 'flac'
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return 'mov'
  if (bytes[0] === 255 && (bytes[1] & 246) === 240) return 'aac'
  if (bytes[0] === 255 && (bytes[1] & 224) === 224) return 'mp3'
  throw new Error('这个音源格式无法播放，请试试其他版本。')
}

async function resolveMedia(id, page) {
  const headers = { Referer: origin + page, 'X-Requested-With': 'XMLHttpRequest' }
  const path = `/api/playurl.php?id=${id}`
  try {
    const media = (await providerText(path, { headers })).trim()
    if (media) return media
  } catch {
    // Retry a transient resolver failure once. A returned preview is handled separately.
  }
  return (await providerText(path, { headers: { ...headers, 'Cache-Control': 'no-cache' } })).trim()
}

function outputSeconds(progress) {
  const times = [...progress.matchAll(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/gm)]
  const last = times.at(-1)
  return last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0
}

async function downloadTrack(id) {
  const page = `/songs/${id}.html`
  const [html, media] = await Promise.all([
    providerText(page),
    resolveMedia(id, page),
  ])
  const title = clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
  const artist = clean(html.match(/<div class="txt">\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1])
  if (!title || !artist) throw new Error('找不到这首歌，请重新搜索。')
  let url
  try { url = new URL(media.trim()) } catch { throw new SourceUnavailable('曲库没有提供这个版本的完整音频。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/^[a-z\d-]+\.kuwo\.cn$/.test(url.hostname)) {
    throw new SourceUnavailable('曲库没有提供这个版本的完整音频。')
  }
  if (url.pathname.includes('/lx/resource/')) {
    throw new SourceUnavailable('曲库只提供了这个版本的试听片段。')
  }

  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new SourceUnavailable('这个版本的音频暂时无法下载。')
  const input = await readBounded(response, 16 * 1024 * 1024)
  const format = audioFormat(input)
  const useM4a = format === 'aac' || format === 'mov'
  const extension = useM4a ? 'm4a' : 'mp3'
  const contentType = useM4a ? 'audio/mp4' : 'audio/mpeg'
  const codec = format === 'flac' || (!useM4a && input.length >= storageLimit)
    ? ['-c:a', 'libmp3lame', '-b:a', '128k']
    : ['-c:a', 'copy']
  const directory = await mkdtemp(join(tmpdir(), 'xunchang-song-'))
  try {
    const source = join(directory, 'source')
    const output = join(directory, `track.${extension}`)
    await writeFile(source, input)
    let progress
    try {
      const result = await run(ffmpeg.path, ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file',
        '-f', format, '-i', source,
        '-map', '0:a:0', '-map_metadata', '-1', '-map_chapters', '-1', ...codec,
        '-progress', 'pipe:1', '-fs', String(storageLimit + 1), output], { timeout: 30000, windowsHide: true })
      progress = result.stdout
    } catch {
      throw new Error('这个音源无法转换，请试试其他版本。')
    }
    const size = (await stat(output)).size
    if (size >= storageLimit) throw new Error('这首歌超过 6 MB，请试试其他版本。')
    const seconds = outputSeconds(progress)
    const expected = verifiedDurations.get(id)
    if (seconds < 30 || (expected && Math.abs(seconds - expected) > 4)) {
      throw new SourceUnavailable('曲库返回的音频时长不符，请上传这个版本的完整文件。')
    }
    return { bytes: await readFile(output), title: `${title} · ${artist}`.slice(0, 200), extension, contentType }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function saveTrack(client, pairId, userId, trackId) {
  const id = await catalogGiftId(pairId, userId, trackId)
  const table = () => client.from('song_gifts')
  const lookup = () => table().select(columns).eq('id', id).eq('sender_id', userId).maybeSingle()
  const existing = await lookup()
  if (existing.error) throw new Error('留歌列表暂时无法读取，请重试。')
  if (existing.data) return existing.data

  const { bytes, title, extension, contentType } = await downloadTrack(trackId)
  const path = `${pairId}/${userId}/${id}.${extension}`
  const bucket = client.storage.from('song-gifts')
  const uploaded = await bucket.upload(path, Uint8Array.from(bytes).buffer, { contentType })
  const uploadError = uploaded.error
  if (uploadError && String(uploadError.statusCode) !== '409' && !/already exists/i.test(uploadError.message)) {
    throw new Error('音频保存失败，请重试。')
  }
  const saved = await table().insert({ id, title, pair_id: pairId, sender_id: userId, storage_path: path })
    .select(columns).single().abortSignal(AbortSignal.timeout(8000))
  if (saved.data) return saved.data
  const recovered = await lookup()
  if (recovered.data) return recovered.data
  if (!uploadError && saved.status >= 400 && saved.status < 500 && saved.error?.code !== '23505') {
    await bucket.remove([path]).catch(() => {})
  }
  throw new Error('歌曲暂未加入列表，请重试。')
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: '请求方式不支持。' })
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1]
  if (!token) return res.status(401).json({ error: '请登录后再搜歌。' })
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(503).json({ error: '搜歌服务暂未配置。' })
  const client = createClient(url, key, {
    accessToken: async () => token,
    global: { fetch: (resource, init) => fetch(resource, { ...init, signal: AbortSignal.any([AbortSignal.timeout(10000), ...(init?.signal ? [init.signal] : [])]) }) },
  })

  try {
    const authResponse = await fetch(new URL('/auth/v1/user', url), {
      headers: { apikey: key, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
    })
    if (!authResponse.ok) return res.status(401).json({ error: '登录已失效，请重新登录。' })
    const { id: userId } = await authResponse.json()
    const pairId = req.method === 'GET' ? req.query.pair : req.body?.pair
    if (typeof pairId !== 'string' || !uuidPattern.test(pairId)) return res.status(400).json({ error: '未找到配对空间。' })
    const pair = await client.from('pairs').select('id').eq('id', pairId).eq('status', 'paired')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`).maybeSingle()
    if (!pair.data) return res.status(403).json({ error: '完成配对后就可以搜歌。' })

    if (req.method === 'GET') {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
      if (!query || query.length > 80) return res.status(400).json({ error: '请输入 1–80 个字符。' })
      const matches = parseSearch(await providerText(`/search.html?keyword=${encodeURIComponent(query)}`))
      const songs = await Promise.all(matches.map(async (song) => ({
        ...song, savedId: await catalogGiftId(pairId, userId, song.id),
        expectedDuration: verifiedDurations.get(song.id),
      })))
      return res.status(200).json({ songs })
    }
    const track = req.body?.track
    if (typeof track !== 'string' || !songIdPattern.test(track)) return res.status(400).json({ error: '歌曲编号无效。' })
    return res.status(200).json({ song: await saveTrack(client, pairId, userId, track) })
  } catch (error) {
    if (error instanceof SourceUnavailable) {
      return res.status(422).json({ code: 'SOURCE_UNAVAILABLE', error: error.message })
    }
    const message = /[\u4e00-\u9fff]/.test(error.message) ? error.message : '搜歌服务暂时不可用，请稍后重试。'
    return res.status(502).json({ error: message })
  }
}
