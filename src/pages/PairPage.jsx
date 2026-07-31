// 配对页 —— 创建自己的空间拿邀请码，或凭邀请码加入对方的空间
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// 生成 6 位邀请码（去掉了容易看错的 0/O/1/I）
function makeInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function PairPage({ userId, pair, onChanged }) {
  const [joinCode, setJoinCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  // 已创建空间、等待对方时：每 5 秒悄悄看一眼对方来了没
  useEffect(() => {
    if (pair?.status !== 'waiting') return
    const timer = setInterval(onChanged, 5000)
    return () => clearInterval(timer) // 离开页面时停止轮询
  }, [pair, onChanged])

  // 创建空间
  async function createPair() {
    setBusy(true)
    setMessage('')
    const { error } = await supabase.from('pairs').insert({
      invite_code: makeInviteCode(),
      user_a: userId,
    })
    if (error) setMessage('创建失败：' + error.message)
    else onChanged() // 通知 App 重新读取数据
    setBusy(false)
  }

  // 凭邀请码加入（调用数据库里的"守门人函数" join_pair）
  async function joinPair() {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) {
      setMessage('邀请码是 6 位字母数字')
      return
    }
    setBusy(true)
    setMessage('')
    const { error } = await supabase.rpc('join_pair', { code })
    if (error) {
      // 守门人函数抛出的中文错误就在 error.message 里
      setMessage(error.message.includes('邀请码') || error.message.includes('不能')
        ? error.message
        : '加入失败：' + error.message)
    } else {
      onChanged()
    }
    setBusy(false)
  }

  async function copyCode() {
    await navigator.clipboard.writeText(pair.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ===== 画面一：已创建空间，等待对方加入 =====
  if (pair?.status === 'waiting') {
    return (
      <div className="w-full max-w-sm rounded-2xl bg-white/70 backdrop-blur-md p-8 shadow-lg text-center">
        <h2 className="text-2xl text-sky-900 mb-2 tracking-widest">窗台已备好</h2>
        <p className="text-sm text-sky-700 mb-6">把邀请码交给那个人，等 TA 推开窗</p>

        <div className="rounded-xl bg-sky-50 border border-sky-200 py-5 mb-3">
          <span className="text-4xl tracking-[0.4em] text-sky-900 font-mono pl-[0.4em]">
            {pair.invite_code}
          </span>
        </div>
        <button
          onClick={copyCode}
          className="text-sm text-sky-600 underline underline-offset-2 hover:text-sky-900"
        >
          {copied ? '已复制 ✓' : '复制邀请码'}
        </button>

        <p className="mt-8 text-xs text-sky-500 animate-pulse">
          等待对方加入中… TA 一进来这里就会自动变化
        </p>
      </div>
    )
  }

  // ===== 画面二：还没有空间，创建或加入 =====
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/70 backdrop-blur-md p-8 shadow-lg">
      <h2 className="text-2xl text-sky-900 text-center mb-6 tracking-widest">两扇窗，要面对面</h2>

      <button
        onClick={createPair}
        disabled={busy}
        className="w-full rounded-lg bg-sky-600 py-2.5 text-white tracking-widest hover:bg-sky-700 disabled:opacity-50 transition-colors"
      >
        创建我们的空间
      </button>
      <p className="mt-2 text-center text-xs text-sky-500">创建后会得到一个邀请码，发给那个人</p>

      <div className="my-6 flex items-center gap-3 text-sky-300">
        <div className="h-px flex-1 bg-sky-200" />
        <span className="text-xs">或者</span>
        <div className="h-px flex-1 bg-sky-200" />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="输入对方的邀请码"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="flex-1 rounded-lg border border-sky-200 bg-white/80 px-4 py-2.5 text-sky-900 tracking-widest placeholder-sky-400 outline-none focus:border-sky-400 font-mono"
        />
        <button
          onClick={joinPair}
          disabled={busy}
          className="rounded-lg bg-sky-600 px-5 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
        >
          加入
        </button>
      </div>

      {message && (
        <p className="mt-4 text-center text-sm text-rose-500">{message}</p>
      )}
    </div>
  )
}

export default PairPage
