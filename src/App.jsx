import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import { BG_MAIN } from './lib/scene'
import AuthPage from './pages/AuthPage'
import PairPage from './pages/PairPage'
import HomePage from './pages/HomePage'

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [data, setData] = useState(null)
  const [recovery, setRecovery] = useState(() => new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery' || new URLSearchParams(location.search).get('recovery') === '1')
  const sessionRef = useRef(null)
  const revision = useRef(0)
  const alive = useRef(false)
  sessionRef.current = session

  useEffect(() => {
    alive.current = true
    let authVersion = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive.current) return
      ++authVersion
      sessionRef.current = next
      setSession(next)
      setAuthReady(true)
      if (next || event === 'SIGNED_OUT') setAuthError('')
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    const startVersion = authVersion
    supabase.auth.getSession().then(({ data: current, error: cause }) => {
      if (!alive.current || authVersion !== startVersion) return
      if (cause) setAuthError('登录状态读取失败，请重试')
      else { setAuthError(''); sessionRef.current = current.session; setSession(current.session) }
      setAuthReady(true)
    }).catch(() => { if (alive.current && authVersion === startVersion) { setAuthError('登录状态读取失败，请重试'); setAuthReady(true) } })
    return () => { alive.current = false; ++revision.current; subscription.unsubscribe() }
  }, [])

  const load = useCallback(async () => {
    const current = sessionRef.current
    const request = ++revision.current
    if (!current) { setData(null); setLoading(false); return }
    const user = current.user
    try {
      const signal = AbortSignal.timeout(20000)
      const profileResult = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle().abortSignal(signal)
      if (profileResult.error) throw profileResult.error
      let profile = profileResult.data
      if (!profile) {
        const created = await supabase.from('profiles').upsert({ id: user.id, nickname: user.user_metadata?.nickname || '未命名' }, { onConflict: 'id', ignoreDuplicates: true }).select().maybeSingle().abortSignal(signal)
        if (created.error) throw created.error
        if (created.data) profile = created.data
        else {
          const retry = await supabase.from('profiles').select('*').eq('id', user.id).single().abortSignal(signal)
          if (retry.error) throw retry.error
          profile = retry.data
        }
      }
      const pairResult = await supabase.from('pairs').select('*').or(`user_a.eq.${user.id},user_b.eq.${user.id}`).maybeSingle().abortSignal(signal)
      if (pairResult.error) throw pairResult.error
      const pair = pairResult.data
      let partnerNickname = ''
      if (pair?.status === 'paired') {
        const partner = await supabase.from('profiles').select('nickname').eq('id', pair.user_a === user.id ? pair.user_b : pair.user_a).maybeSingle().abortSignal(signal)
        if (partner.error) throw partner.error
        partnerNickname = partner.data?.nickname || ''
      }
      if (alive.current && request === revision.current && sessionRef.current?.user.id === user.id) {
        setData({ userId: user.id, profile, pair, partnerNickname })
        setError('')
      }
    } catch {
      if (alive.current && request === revision.current) setError('资料未能同步，请重试')
    } finally { if (alive.current && request === revision.current) setLoading(false) }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!authReady) return
    setLoading(true)
    setData(null)
    setError('')
    load()
  }, [userId, authReady, load])

  async function retry() {
    setError('')
    setAuthError('')
    setLoading(true)
    if (sessionRef.current) { await load(); return }
    try {
      const result = await supabase.auth.getSession()
      if (result.error) throw result.error
      sessionRef.current = result.data.session
      setSession(result.data.session)
      if (!result.data.session) setLoading(false)
    } catch { setAuthError('登录状态读取失败，请重试'); setLoading(false) }
  }
  async function logout() {
    const { error: cause } = await supabase.auth.signOut()
    if (cause) setError('退出登录失败，请重试')
  }
  function finishRecovery() {
    setRecovery(false)
    history.replaceState(null, '', location.pathname)
  }

  const visibleError = authError || error
  if (!recovery && session && data?.userId === userId && data.pair?.status === 'paired') {
    return <><HomePage key={`${userId}:${data.pair.id}`} {...data} onChanged={load} />{visibleError && <p role="alert" className="fixed bottom-4 left-4 z-30 rounded-lg bg-[#857c91]/95 p-3 text-xs text-[#f7f2ee]">{visibleError}<button onClick={retry} className="ml-3 underline">重试</button></p>}</>
  }
  let screen
  if (recovery && authReady) screen = <AuthPage recovery canReset={!!session} onRecoveryDone={finishRecovery} />
  else if (visibleError) screen = <div role="alert" className="entry-card"><p className="entry-message">{visibleError}</p><div className="entry-links"><button onClick={retry}>重试</button>{session && <button onClick={logout}>退出登录</button>}</div></div>
  else if (!authReady || loading) screen = <p role="status" className="entry-card text-center text-sm">正在加载…</p>
  else if (!session) screen = <AuthPage />
  else if (data?.profile) screen = <PairPage userId={userId} pair={data.pair} onChanged={load} />
  else screen = <button className="entry-primary w-full" onClick={retry}>重新读取资料</button>

  return (
    <main className="entry-page" style={{ backgroundImage: `linear-gradient(#4a435826, #4a435826), url(${BG_MAIN})` }}>
      <div className="entry-content">
        <h1 className="entry-brand">寻常</h1>
        {screen}
      </div>
    </main>
  )
}
