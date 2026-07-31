// 注册 / 登录页 —— 「一羽」的大门
import { useState } from 'react'
import { supabase } from '../lib/supabase'

function AuthPage() {
  // mode: 'login' 登录模式 / 'register' 注册模式
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault() // 阻止表单默认的"刷新页面"行为
    setMessage('')
    setBusy(true)

    if (mode === 'register') {
      if (!nickname.trim()) {
        setMessage('给自己取个昵称吧')
        setBusy(false)
        return
      }
      // 注册：昵称先存进账号的"随身携带信息"里，登录后再写进 profiles 表
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname: nickname.trim() } },
      })
      if (error) {
        setMessage(translateError(error.message))
      }
      // 注册成功后 Supabase 会自动登录，App.jsx 里的监听会接管画面
    } else {
      // 登录
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage(translateError(error.message))
      }
    }
    setBusy(false)
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/70 backdrop-blur-md p-8 shadow-lg">
      <h2 className="text-2xl text-sky-900 text-center mb-6 tracking-widest">
        {mode === 'login' ? '回到窗台' : '推开这扇窗'}
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === 'register' && (
          <input
            type="text"
            placeholder="你的昵称"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
            className="rounded-lg border border-sky-200 bg-white/80 px-4 py-2.5 text-sky-900 placeholder-sky-400 outline-none focus:border-sky-400"
          />
        )}
        <input
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-lg border border-sky-200 bg-white/80 px-4 py-2.5 text-sky-900 placeholder-sky-400 outline-none focus:border-sky-400"
        />
        <input
          type="password"
          placeholder="密码（至少 6 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="rounded-lg border border-sky-200 bg-white/80 px-4 py-2.5 text-sky-900 placeholder-sky-400 outline-none focus:border-sky-400"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-sky-600 py-2.5 text-white tracking-widest hover:bg-sky-700 disabled:opacity-50 transition-colors"
        >
          {busy ? '请稍候…' : mode === 'login' ? '登 录' : '注 册'}
        </button>
      </form>

      {message && (
        <p className="mt-4 text-center text-sm text-rose-500">{message}</p>
      )}

      <p className="mt-6 text-center text-sm text-sky-700">
        {mode === 'login' ? '还没有账号？' : '已经有账号了？'}
        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage('') }}
          className="ml-1 underline underline-offset-2 hover:text-sky-900"
        >
          {mode === 'login' ? '去注册' : '去登录'}
        </button>
      </p>
    </div>
  )
}

// 把 Supabase 的英文报错翻译成温柔的中文
function translateError(msg) {
  if (msg.includes('Invalid login credentials')) return '邮箱或密码不对，再试一次'
  if (msg.includes('already registered')) return '这个邮箱已经注册过了，去登录吧'
  if (msg.includes('at least 6 characters')) return '密码至少要 6 位'
  if (msg.includes('invalid format')) return '邮箱格式好像不太对'
  if (msg.includes('Email not confirmed')) return '这个邮箱还没完成验证，去邮箱里点一下确认链接'
  return '出了点小问题：' + msg
}

export default AuthPage
