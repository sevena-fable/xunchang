// 配对页 —— 创建自己的空间拿邀请码，或凭邀请码加入对方的空间
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// 生成 6 位邀请码（去掉了容易看错的 0/O/1/I）
function makeInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => chars[byte % chars.length]).join('')
}

function PairPage({ userId, pair, onChanged }) {
  const [joinCode, setJoinCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const lock = useRef(false)
  const alive = useRef(false)
  const copyTimer = useRef(null)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; clearTimeout(copyTimer.current) }
  }, [])

  useEffect(() => {
    if (pair?.status !== 'waiting') return
    let active = true
    let timer
    const poll = async () => {
      try { await onChanged() }
      catch (error) { if (active) setMessage('配对状态同步失败：' + error.message) }
      if (active) timer = setTimeout(poll, 5000)
    }
    timer = setTimeout(poll, 5000)
    return () => { active = false; clearTimeout(timer) }
  }, [pair?.status, onChanged])

  async function run(action) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      const { error } = await action()
      if (error) throw error
      await onChanged()
    } catch (error) {
      if (alive.current) setMessage('操作未完成：' + error.message)
    } finally { lock.current = false; if (alive.current) setBusy(false) }
  }

  function createPair() {
    run(() => supabase.from('pairs').insert({ invite_code: makeInviteCode(), user_a: userId }).abortSignal(AbortSignal.timeout(20000)))
  }

  function joinPair() {
    const code = joinCode.trim().toUpperCase()
    if (!/^[A-Z2-9]{6}$/.test(code)) { setMessage('邀请码是 6 位字母数字'); return }
    run(() => supabase.rpc('join_pair', { code }).abortSignal(AbortSignal.timeout(20000)))
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(pair.invite_code)
      if (!alive.current) return
      setCopied(true)
      setMessage('')
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch { if (alive.current) setMessage('复制失败，请手动选中邀请码复制') }
  }

  if (pair?.status === 'waiting') {
    return (
      <section className="entry-card text-center" aria-labelledby="pair-heading">
        <h2 id="pair-heading" className="entry-heading">等待配对</h2>
        <p className="entry-muted">将邀请码发给对方</p>
        <div className="entry-code">{pair.invite_code}</div>
        <div className="entry-links"><button onClick={copyCode}>{copied ? '已复制' : '复制邀请码'}</button></div>
        {message && <p role="status" className="entry-message">{message}</p>}
        <p className="entry-muted mt-6">对方加入后自动进入主页</p>
      </section>
    )
  }

  return (
    <section className="entry-card" aria-labelledby="pair-heading">
      <h2 id="pair-heading" className="entry-heading">与对方配对</h2>
      <button onClick={createPair} disabled={busy} className="entry-primary w-full">创建我们的空间</button>
      <p className="entry-muted mt-2 text-center">创建后可获得邀请码</p>
      <div className="entry-divider">或者</div>
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="邀请码"
          placeholder="输入对方的邀请码"
          value={joinCode}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          maxLength={6}
          className="entry-input flex-1 font-mono tracking-widest"
        />
        <button onClick={joinPair} disabled={busy} className="entry-primary shrink-0">加入</button>
      </div>
      {message && <p role="status" className="entry-message">{message}</p>}
    </section>
  )
}

export default PairPage
