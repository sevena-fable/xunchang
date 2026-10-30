import { supabase } from './supabase'
import { fileHash, imagePath, IMAGE_EXTENSIONS, validateAttachments } from './letterImages'
import { sameAnnotations, validateAnnotations } from './annotations'
import { sameReply, validateReply } from './annotationReplies'

const bucket = supabase.storage.from('letter-images')

function failure(error, confirmedNotSent = false) {
  return Object.assign(new Error(error.message || String(error)), { confirmedNotSent })
}

async function findLetter(id) {
  const { data, error } = await supabase.from('letters').select('*').eq('id', id).maybeSingle().abortSignal(AbortSignal.timeout(20000))
  if (error) throw failure(error)
  return data
}

function sameLetter(letter, input) {
  return letter.sender_id === input.userId && letter.pair_id === input.pairId && letter.content === input.content && letter.stationery === input.stationery && JSON.stringify(letter.images) === JSON.stringify(input.images) && sameAnnotations(letter.annotations, input.annotations)
}

export async function insertLetter({ id, pairId, userId, content, annotations = [], stationery = 'cream', images = [], deliver = true }) {
  try { validateAnnotations(content, annotations) } catch (error) { throw failure(error, true) }
  const input = { id, pairId, userId, content, annotations, stationery, images }
  const existing = await findLetter(id)
  if (existing) {
    if (!sameLetter(existing, input)) throw new Error('这次分享已有不同内容的记录，请先在台历核对')
    return existing
  }
  const now = new Date().toISOString()
  const { data, error, status } = await supabase.from('letters').insert({ id, pair_id: pairId, sender_id: userId, content, annotations, stationery, images, status: deliver ? 'delivered' : 'sealed', delivered_at: deliver ? now : null }).select().single().abortSignal(AbortSignal.timeout(20000))
  if (!error) return data
  const confirmed = await findLetter(id)
  if (confirmed && sameLetter(confirmed, input)) return confirmed
  if (confirmed) throw new Error('这次分享已有不同内容的记录，请先在台历核对')
  if (error.code === 'PGRST204' && /annotations/.test(error.message)) throw failure(new Error('批注存储尚未就绪，请先完成批注数据库迁移'), true)
  throw failure(error, status >= 400 && status < 500 && status !== 408 && error.code !== '57014')
}

export async function sendLetter({ id, pairId, userId, content, annotations = [], attachments }) {
  try { validateAttachments(attachments); validateAnnotations(content, annotations) } catch (error) { throw failure(error, true) }
  const objects = await Promise.all(attachments.map(async (attachment) => {
    const hash = await fileHash(attachment.file)
    return { file: attachment.file, hash, path: `${userId}/${id}/${attachment.id}-${hash}.${IMAGE_EXTENSIONS[attachment.file.type]}` }
  }))
  const images = objects.map((item) => item.path)
  const existing = await findLetter(id)
  if (existing) {
    if (!sameLetter(existing, { pairId, userId, content, annotations, stationery: 'cream', images })) throw new Error('这次分享已有不同内容的记录，请先在台历核对')
    return existing
  }
  if (objects.length) {
    const { data: privateReady, error: readinessError } = await supabase.rpc('private_letter_images_ready')
    if (readinessError || privateReady !== true) throw failure(new Error('私有照片存储尚未就绪，请先完成安全迁移'), true)
  }
  for (const item of objects) {
    const { error } = await bucket.upload(item.path, item.file, { contentType: item.file.type, cacheControl: '3600', upsert: false })
    if (!error) continue
    const conflict = error.status === 409 || ['409', 'ResourceAlreadyExists', 'KeyAlreadyExists', 'already_exists'].includes(String(error.statusCode))
    const legacyConflict = error.status === 400 && /^(?:The resource already exists|Asset Already Exists)$/i.test(error.message)
    if (conflict || legacyConflict) {
      const { data, error: readError } = await bucket.download(item.path)
      if (!readError && await fileHash(data) === item.hash) continue
    }
    throw failure(error, true)
  }
  return insertLetter({ id, pairId, userId, content, annotations, images, deliver: true })
}

export async function resolveLetterImages(images) {
  const urls = []
  try {
    for (const image of images) {
      const path = imagePath(image, supabase.supabaseUrl)
      const { data, error } = await bucket.download(path)
      if (error) throw failure(error)
      urls.push(URL.createObjectURL(data))
    }
    return urls
  } catch (error) { urls.forEach(URL.revokeObjectURL); throw error }
}

export async function deliverLetter(letter) {
  const { error } = await supabase.rpc('deliver_sealed_letter', { letter_id: letter.id })
  if (error) throw failure(error)
}

export async function markRead(letter) {
  const { error } = await supabase.rpc('mark_letter_read', { letter_id: letter.id })
  if (error) throw failure(error)
}

export async function submitReaction({ letterId, pairId, userId, emoji, note }) {
  const { error } = await supabase.from('reactions').insert({ letter_id: letterId, pair_id: pairId, user_id: userId, emoji: emoji || null, note: note?.trim() || null })
  if (error) throw failure(error)
}

// The UUID survives uncertain responses so retrying cannot create a second reply.
export async function submitAnnotationReply({ letter, userId, id, start, end, quote, note }) {
  const input = { id, letter_id: letter.id, pair_id: letter.pair_id, user_id: userId, start, end, quote, note }
  try { validateReply(letter.content, input) } catch (error) { throw failure(error, true) }
  const find = async () => {
    const { data, error } = await supabase.from('annotation_replies').select('*').eq('id', id).maybeSingle().abortSignal(AbortSignal.timeout(20000))
    if (error) throw failure(new Error(error.code === 'PGRST205' || error.code === '42P01' ? '批注回复尚未就绪，请稍后再试' : '批注回复暂时无法确认，请重试'), error.code === 'PGRST205' || error.code === '42P01')
    if (data && !sameReply(data, input)) throw failure(new Error('这次回复已有不同内容的记录，请先核对'), true)
    return data
  }
  const existing = await find()
  if (existing) return existing
  const { data, error, status } = await supabase.from('annotation_replies').insert(input).select().single().abortSignal(AbortSignal.timeout(20000))
  if (!error) return data
  const confirmed = await find()
  if (confirmed) return confirmed
  const definite = status >= 400 && status < 500 && status !== 408 && error.code !== '57014'
  throw failure(new Error(error.code === '23505' ? '这段文字已经有你的回复，请关闭后刷新查看' : '回复尚未确认发送成功，请重试'), definite)
}
