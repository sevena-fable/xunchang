// 信件仓库 —— 一处集中管理"桌上所有的信"和"信上的回应"
// 为什么单独抽出来：场景上的信封要显示未读数量、台历要按日期翻信、
// 信件面板要列清单，三处都需要同一份数据。与其各自去查数据库，不如统一在这里查一次。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { settleStroll } from '../lib/pigeon'

// 把时间变成 "2026-07-31" 这样的日子标签（台历按这个分组）
export function dayKey(iso) {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function useLetters({ pair, userId, pigeon, onPigeonChanged }) {
  const [letters, setLetters] = useState([])
  const [reactions, setReactions] = useState({})  // letter_id → 那条回应
  const [loading, setLoading] = useState(true)

  // 用 ref 存最新的鸽子/空间/回调，这样下面的 load 只依赖 pair.id，
  // 实时订阅就不会因为鸽子一动就反复重建
  const pigeonRef = useRef(pigeon)
  const pairRef = useRef(pair)
  const onChangedRef = useRef(onPigeonChanged)
  useEffect(() => { pigeonRef.current = pigeon }, [pigeon])
  useEffect(() => { pairRef.current = pair }, [pair])
  useEffect(() => { onChangedRef.current = onPigeonChanged }, [onPigeonChanged])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('letters').select('*')
      .eq('pair_id', pair.id)
      .order('sealed_at', { ascending: false })
    const list = data || []
    setLetters(list)

    // 回应表是阶段六才建的；万一还没建，这里静静跳过，不影响其它功能
    const { data: reacts } = await supabase
      .from('reactions').select('*').eq('pair_id', pair.id)
    if (reacts) {
      const map = {}
      reacts.forEach((r) => { map[r.letter_id] = r })
      setReactions(map)
    }

    setLoading(false)

    // 惰性溜达：这里恰好握着最新的信件数据，顺手替鸽子结算一次它该在哪侧
    const moved = await settleStroll(pigeonRef.current, pairRef.current, list)
    if (moved) onChangedRef.current?.()
  }, [pair.id])

  // 首次加载 + 实时订阅（对方寄信、读信、回应都会推过来）
  useEffect(() => {
    load()
    const channel = supabase
      .channel(`desk-${pair.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'letters', filter: `pair_id=eq.${pair.id}` },
        () => load())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'reactions', filter: `pair_id=eq.${pair.id}` },
        () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [pair.id, load])

  // 收到的、还没读的信（对方寄来 + 已送达）
  const unread = useMemo(
    () => letters.filter((l) => l.sender_id !== userId && l.status === 'delivered'),
    [letters, userId],
  )
  // 我封存、还没寄出的信
  const mySealed = useMemo(
    () => letters.filter((l) => l.sender_id === userId && l.status === 'sealed'),
    [letters, userId],
  )
  // 已经寄出/读过的往来信件（台历与历史列表用，按时间正序更像"日子"）
  const history = useMemo(
    () => letters.filter((l) => l.status !== 'sealed'),
    [letters],
  )

  return { letters, reactions, unread, mySealed, history, loading, reload: load }
}
