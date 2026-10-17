import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPage({ recovery = false, canReset = false, onRecoveryDone }) {
  const [mode, setMode] = useState(recovery ? 'reset' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const lock = useRef(false)
  const alive = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { switchMode(recovery ? 'reset' : 'login') }, [recovery])

  async function submit(event) {
    event.preventDefault()
    if (lock.current || done || (mode === 'reset' && !canReset)) return
    if (mode === 'register' && !nickname.trim()) { setMessage('请输入昵称'); return }
    if (mode === 'reset' && password !== confirm) { setMessage('两次密码不一致'); return }
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/?recovery=1` })
        if (error) throw error
        if (alive.current) { setDone(true); setMessage('如果该邮箱已注册，将收到重置邮件。') }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        if (alive.current) { setDone(true); setPassword(''); setConfirm(''); setMessage('新密码已保存') }
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { nickname: nickname.trim() } } })
        if (error) throw error
        if (alive.current && !data.session) { setDone(true); setPassword(''); setMessage('请查收验证邮件，验证后登录。') }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
    } catch (error) { if (alive.current) setMessage(translateError(error)) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }

  function switchMode(next) { setMode(next); setDone(false); setMessage(''); setPassword(''); setConfirm('') }
  function returnToLogin() { switchMode('login'); if (recovery) onRecoveryDone() }
  const expired = mode === 'reset' && !canReset
  return (
    <section className="entry-card panel-card" aria-labelledby="auth-heading">
      <h2 id="auth-heading" className="entry-heading panel-title">{{ login: '登录', register: '注册', forgot: '找回密码', reset: '设置新密码' }[mode]}</h2>
      {expired ? <p role="status" className="entry-message">重置链接已失效，请重新申请。</p> : !done && (
        <form onSubmit={submit} className="flex flex-col gap-4" aria-busy={busy}>
          {mode === 'register' && <label className="entry-field">昵称<input aria-label="你的昵称" autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={12} required disabled={busy} className="panel-input" /></label>}
          {mode !== 'reset' && <label className="entry-field">邮箱<input aria-label="邮箱" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} className="panel-input" /></label>}
          {mode !== 'forgot' && <label className="entry-field">{mode === 'reset' ? '新密码' : '密码'}<input aria-label={mode === 'reset' ? '新密码' : '密码'} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? '' : '至少 6 位'} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} disabled={busy} className="panel-input" /></label>}
          {mode === 'reset' && <label className="entry-field">确认新密码<input aria-label="确认新密码" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required minLength={6} disabled={busy} className="panel-input" /></label>}
          <button type="submit" disabled={busy} className="panel-primary mt-2">{busy ? { login: '正在登录…', register: '正在注册…', forgot: '正在发送…', reset: '正在保存…' }[mode] : { login: '登录', register: '注册', forgot: '发送重置邮件', reset: '保存新密码' }[mode]}</button>
        </form>
      )}
      <p role="status" className="entry-message">{message}</p>
      <div className="entry-links">
        {mode === 'login' && <><button type="button" disabled={busy} onClick={() => switchMode('register')}>去注册</button><button type="button" disabled={busy} onClick={() => switchMode('forgot')}>忘记密码</button></>}
        {(mode === 'register' || mode === 'forgot' || expired) && <button type="button" disabled={busy} onClick={returnToLogin}>返回登录</button>}
        {(expired || (done && mode === 'forgot')) && <button type="button" disabled={busy} onClick={() => switchMode('forgot')}>重新申请</button>}
        {done && mode === 'reset' && <button type="button" onClick={onRecoveryDone}>返回首页</button>}
      </div>
    </section>
  )
}

function translateError(error) {
  const messages = {
    invalid_credentials: '邮箱或密码错误',
    email_not_confirmed: '邮箱尚未验证，请查收验证邮件',
    email_exists: '该邮箱已注册，请登录',
    user_already_exists: '该邮箱已注册，请登录',
    email_address_invalid: '邮箱格式不正确',
    weak_password: '密码不符合要求，请使用更长的密码',
    same_password: '新密码不能与原密码相同',
    signup_disabled: '暂时无法注册',
    email_provider_disabled: '暂时无法使用邮箱登录',
    otp_expired: '链接已失效，请重新申请',
    session_not_found: '登录状态已失效，请重新登录',
    session_expired: '登录状态已失效，请重新登录',
    over_email_send_rate_limit: '发送过于频繁，请稍后重试',
    over_request_rate_limit: '操作过于频繁，请稍后重试',
    request_timeout: '请求超时，请重试',
  }
  if (Object.hasOwn(messages, error.code)) return messages[error.code]
  if (error.status === 429) return '操作过于频繁，请稍后重试'
  if (error.status >= 500) return '服务暂时不可用，请稍后重试'
  if (error.name === 'AuthRetryableFetchError') return '网络请求失败，请重试'
  return '操作未完成，请重试'
}
