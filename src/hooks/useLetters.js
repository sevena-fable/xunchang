import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useLetters({ pair, userId }) {
  const [letters, setLetters] = useState([])
  const [reactions, setReactions] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reactionLoading, setReactionLoading] = useState(true)
  const [reactionError, setReactionError] = useState('')
  const [annotationReplies, setAnnotationReplies] = useState({})
  const [repliesLoading, setRepliesLoading] = useState(true)
  const [repliesError, setRepliesError] = useState('')
  const repliesRequest = useRef(0)
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

  const loadReplies = useCallback(async () => {
    const revision = ++repliesRequest.current
    setRepliesLoading(true)
    try {
      const result = await supabase.from('annotation_replies').select('*').eq('pair_id', pair.id).order('created_at', { ascending: true }).abortSignal(AbortSignal.timeout(20000))
      if (result.error) throw result.error
      if (!active.current || revision !== repliesRequest.current) return
      const grouped = {}
      for (const reply of result.data) (grouped[reply.letter_id] ||= []).push(reply)
      setAnnotationReplies(grouped)
      setRepliesError('')
    } catch {
      if (active.current && revision === repliesRequest.current) setRepliesError('批注回复暂时没有加载出来，可以重试；不影响阅读正文。')
    } finally { if (active.current && revision === repliesRequest.current) setRepliesLoading(false) }
  }, [pair.id])
  const load = useCallback(() => Promise.all([loadLetters(), loadReactions(), loadReplies()]), [loadLetters, loadReactions, loadReplies])

  useEffect(() => {
    active.current = true
    setLetters([])
    setReactions({})
    setAnnotationReplies({})
    setRepliesError('')
    setError('')
    setReactionError('')
    setLoading(true)
    load()
    const channel = supabase.channel(`desk-${pair.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'letters', filter: `pair_id=eq.${pair.id}` }, loadLetters)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions', filter: `pair_id=eq.${pair.id}` }, loadReactions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'annotation_replies', filter: `pair_id=eq.${pair.id}` }, loadReplies)
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
      ++repliesRequest.current
      supabase.removeChannel(channel)
      window.removeEventListener('online', load)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [pair.id, load, loadLetters, loadReactions, loadReplies])

  const unread = useMemo(() => letters.filter((letter) => letter.sender_id !== userId && letter.status === 'delivered'), [letters, userId])
  const mySealed = useMemo(() => letters.filter((letter) => letter.sender_id === userId && ['sealed', 'delivering'].includes(letter.status)), [letters, userId])
  const history = useMemo(() => letters.filter((letter) => ['delivered', 'read'].includes(letter.status)), [letters])
  return { annotationReplies, repliesLoading, repliesError, reloadReplies: loadReplies, letters, reactions, unread, mySealed, history, loading, error, reactionLoading, reactionError, reload: load, reloadReactions: loadReactions }
}
