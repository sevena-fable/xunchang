import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useLetters({ pair, userId }) {
  const [letters, setLetters] = useState([])
  const [reactions, setReactions] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reactionLoading, setReactionLoading] = useState(true)
  const [reactionError, setReactionError] = useState('')
  const request = useRef(0)
  const reactionRequest = useRef(0)
  const active = useRef(false)
  const loadLetters = useCallback(async () => {
    const revision = ++request.current
    try {
      const result = await supabase.from('letters').select('*').eq('pair_id', pair.id).order('sealed_at', { ascending: false }).abortSignal(AbortSignal.timeout(20000))
      if (result.error) throw result.error
      if (!active.current || revision !== request.current) return
      setLetters(result.data.filter((letter) => letter.status !== 'sealed' || letter.sender_id === userId))
      setError('')
    } catch (cause) {
      if (active.current && revision === request.current) setError('内容未能同步：' + cause.message)
    } finally {
      if (active.current && revision === request.current) setLoading(false)
    }
  }, [pair.id, userId])

  const loadReactions = useCallback(async () => {
    const revision = ++reactionRequest.current
    setReactionLoading(true)
    try {
      const result = await supabase.from('reactions').select('*').eq('pair_id', pair.id).abortSignal(AbortSignal.timeout(20000))
      if (result.error) throw result.error
      if (!active.current || revision !== reactionRequest.current) return
      setReactions(Object.fromEntries(result.data.map((reaction) => [reaction.letter_id, reaction])))
      setReactionError('')
    } catch {
      if (active.current && revision === reactionRequest.current) setReactionError('回应暂时没有加载出来，可以重试；不影响阅读正文。')
    } finally {
      if (active.current && revision === reactionRequest.current) setReactionLoading(false)
    }
  }, [pair.id])

  const load = useCallback(() => Promise.all([loadLetters(), loadReactions()]), [loadLetters, loadReactions])

  useEffect(() => {
    active.current = true
    setLetters([])
    setReactions({})
    setError('')
    setReactionError('')
    setLoading(true)
    load()
    const channel = supabase.channel(`desk-${pair.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'letters', filter: `pair_id=eq.${pair.id}` }, loadLetters)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `pair_id=eq.${pair.id}` }, loadReactions)
      .subscribe((status) => {
        if (!active.current) return
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setError('实时同步暂时中断，可手动重试')
        if (status === 'SUBSCRIBED') load()
      })
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('online', load)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active.current = false
      ++request.current
      ++reactionRequest.current
      supabase.removeChannel(channel)
      window.removeEventListener('online', load)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [pair.id, load, loadLetters, loadReactions])

  const unread = useMemo(() => letters.filter((letter) => letter.sender_id !== userId && letter.status === 'delivered'), [letters, userId])
  const mySealed = useMemo(() => letters.filter((letter) => letter.sender_id === userId && ['sealed', 'delivering'].includes(letter.status)), [letters, userId])
  const history = useMemo(() => letters.filter((letter) => ['delivered', 'read'].includes(letter.status)), [letters])
  return { letters, reactions, unread, mySealed, history, loading, error, reactionLoading, reactionError, reload: load, reloadReactions: loadReactions }
}
