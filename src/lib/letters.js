// 信件相关的所有数据库动作，都收在这里
// 组件只负责"好看"，规则和写库都在这一层，避免同一条规则散落在好几个文件里。
import { supabase } from './supabase'
import { otherSide, arrivePigeon } from './pigeon'

// 四种回应表情（规则 5：只有这四种）
export const REACTIONS = [
  { key: 'coffee', icon: '☕', label: '下次聊聊' },
  { key: 'heart', icon: '❤️', label: '喜欢' },
  { key: 'thumb', icon: '👍', label: '点赞' },
  { key: 'dog', icon: '🐶', label: '狗头' },
]

export function reactionOf(key) {
  return REACTIONS.find((r) => r.key === key)
}

// 新增一封信。deliver=true 表示直接寄出（已送达），否则只是封存在自己桌上。
// images 字段是阶段六才加的列，万一数据库还没升级，这里会自动退回"不带图片"再存一次，
// 免得整封信都写不进去。
export async function insertLetter({ pairId, userId, content, stationery, images = [], deliver }) {
  const now = new Date().toISOString()
  const base = {
    pair_id: pairId,
    sender_id: userId,
    content: content.trim(),
    stationery,
    status: deliver ? 'delivered' : 'sealed',
    delivered_at: deliver ? now : null,
  }
  let { error } = await supabase.from('letters').insert({ ...base, images })
  if (error && /images/i.test(error.message)) {
    ({ error } = await supabase.from('letters').insert(base))
  }
  return error
}

// 把一封封存的信真正寄出：标记送达 + 鸽子叼着它飞去对方窗台
export async function deliverLetter(letter, pigeon, side, pair) {
  await supabase.from('letters')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', letter.id)
  await arrivePigeon(pigeon, otherSide(side), pair)
}

// 读信：标记已读，并让守着这封信的鸽子在原地重新推导状态
// （这侧还有别的未读信就接着守，否则恢复空闲、可以自由溜达 —— 规则 3.4）
export async function markRead(letter, pigeon, pair) {
  await supabase.from('letters')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('id', letter.id)
  if (pigeon && pigeon.state === 'guarding') {
    await arrivePigeon(pigeon, pigeon.location, pair)
  }
}

// 提交回应（规则 5：只有收信人、一封信一次、提交后不可修改）
// 数据库层面也上了锁：letter_id 唯一 + 没有 update 策略。
export async function submitReaction({ letterId, pairId, userId, emoji, note }) {
  const { error } = await supabase.from('reactions').insert({
    letter_id: letterId,
    pair_id: pairId,
    user_id: userId,
    emoji: emoji || null,
    note: note?.trim() ? note.trim() : null,
  })
  return error
}

// 上传一张信里的图片，返回可直接放进 <img> 的公开网址
// 路径规则：自己的 id / 随机文件名 —— 存储策略只允许你写自己那层文件夹
export async function uploadLetterImage(file, userId) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('letter-images')
    .upload(path, file, { cacheControl: '31536000', upsert: false })
  if (error) return { error }
  const { data } = supabase.storage.from('letter-images').getPublicUrl(path)
  return { url: data.publicUrl }
}
