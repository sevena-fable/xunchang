// 历史信鸽逻辑，未接入当前阅读分享流程。
import { supabase } from './supabase'

// ===== 历史可调参数 =====
export const SUMMON_TIMEOUT_MS = 60_000          // 召唤许可：60 秒无响应视为失败
export const STROLL_INTERVAL_MS = 20 * 60_000    // 溜达周期：每 20 分钟一次结算机会
export const STROLL_BIAS_TO_UNREAD = 0.75        // 有未读信时，溜达偏向收信人一侧的概率

// ===== 基础工具 =====
// 我是 user_a 还是 user_b？我的窗台是哪一侧？
export function mySide(pair, userId) {
  return pair.user_a === userId ? 'a_window' : 'b_window'
}
export function otherSide(side) {
  return side === 'a_window' ? 'b_window' : 'a_window'
}

// 某个窗台的主人 id（a_window 的主人是 user_a）
function ownerOf(side, pair) {
  return side === 'a_window' ? pair.user_a : pair.user_b
}

// 停在某窗台的"未读信"里最早的一封（没有则返回 null）
// 收信人 = 窗台主人；未读信 = 已送达(delivered) 且不是收信人自己寄的
export function guardLetterAt(side, pair, letters) {
  const recipientId = ownerOf(side, pair)
  const waiting = letters
    .filter((l) => l.status === 'delivered' && l.sender_id !== recipientId)
    .sort((a, b) => new Date(a.delivered_at) - new Date(b.delivered_at))
  return waiting[0] || null
}

// 有未读信的"吸引侧"：哪一侧堆着未读信。两侧都有则取更多的一侧，
// 数量相同则取等待最久的一侧；都没有则返回 null。
export function unreadSide(pair, letters) {
  const aWaiting = letters.filter((l) => l.status === 'delivered' && l.sender_id !== pair.user_a)
  const bWaiting = letters.filter((l) => l.status === 'delivered' && l.sender_id !== pair.user_b)
  if (aWaiting.length === 0 && bWaiting.length === 0) return null
  if (aWaiting.length !== bWaiting.length) {
    return aWaiting.length > bWaiting.length ? 'a_window' : 'b_window'
  }
  // 数量相同：比谁等得更久（最早送达的那封在哪侧）
  const aOldest = Math.min(...aWaiting.map((l) => new Date(l.delivered_at).getTime()))
  const bOldest = Math.min(...bWaiting.map((l) => new Date(l.delivered_at).getTime()))
  return aOldest <= bOldest ? 'a_window' : 'b_window'
}

// 根据"鸽子落在哪一侧" + 当前信件，推导它应处的状态：
// 落点有未读信 → 守信(guarding)；否则空闲(idle)
function deriveState(side, pair, letters) {
  const guard = guardLetterAt(side, pair, letters)
  return {
    state: guard ? 'guarding' : 'idle',
    guarding_letter_id: guard ? guard.id : null,
  }
}

// 让鸽子"到达"某一侧窗台，并按落点自动推导状态，写回数据库。
// 召唤成功、寄信送达都用它，保证状态推导只有一处。
// 落点状态需要知道未读信在哪侧，所以自己去查一下，调用方不必关心信件。
export async function arrivePigeon(pigeon, side, pair) {
  const { data: letters } = await supabase
    .from('letters')
    .select('id, sender_id, status, delivered_at')
    .eq('pair_id', pair.id)
    .eq('status', 'delivered')
  const now = new Date().toISOString()
  const { state, guarding_letter_id } = deriveState(side, pair, letters || [])
  const { data } = await supabase.from('pigeons').update({
    location: side,
    state,
    guarding_letter_id,
    last_stroll_at: now, // 刚被挪动，重新起算溜达时间
    updated_at: now,
  }).eq('id', pigeon.id).select().maybeSingle()
  return data
}

// ===== 惰性溜达结算 =====
// 没有后台服务器，鸽子无法自己动。于是"谁打开页面，谁来结算"：
// 根据距上次溜达过了几个周期，按概率一次性算出它现在该在哪，写回数据库。
// 返回结算后的鸽子（若无需结算则返回 null）。
export async function settleStroll(pigeon, pair, letters) {
  if (!pigeon) return null
  if (pigeon.state === 'delivering') return null // 送信途中不溜达

  const last = new Date(pigeon.last_stroll_at).getTime()
  const elapsed = Date.now() - last
  const periods = Math.floor(elapsed / STROLL_INTERVAL_MS)
  if (periods < 1) return null // 还没到下一个溜达周期

  const attractSide = unreadSide(pair, letters) // 未读信所在侧（可能为 null）
  let loc = pigeon.location
  for (let i = 0; i < periods; i++) {
    if (attractSide) {
      loc = Math.random() < STROLL_BIAS_TO_UNREAD ? attractSide : otherSide(attractSide)
    } else {
      loc = Math.random() < 0.5 ? 'a_window' : 'b_window'
    }
  }

  const { state, guarding_letter_id } = deriveState(loc, pair, letters)
  // 时间锚点推进到最近一个已过去的周期边界（不直接用 now，保证周期节奏稳定）
  const nextAnchor = new Date(last + periods * STROLL_INTERVAL_MS).toISOString()

  // 用旧的 last_stroll_at 作为更新条件：如果两端同时结算，只有一端会成功，
  // 另一端的条件不再匹配、自动作废，避免鸽子被算两次。
  const { data } = await supabase.from('pigeons').update({
    location: loc,
    state,
    guarding_letter_id,
    last_stroll_at: nextAnchor,
    updated_at: new Date().toISOString(),
  }).eq('id', pigeon.id).eq('last_stroll_at', pigeon.last_stroll_at).select().maybeSingle()

  return data
}
