// 领养页 —— 配对成功后，共同迎接一只信鸽
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function AdoptPage({ pair, onChanged }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  // 对方可能先一步完成了领养：每 5 秒看一眼鸽子到了没
  useEffect(() => {
    const timer = setInterval(onChanged, 5000)
    return () => clearInterval(timer)
  }, [onChanged])

  async function adopt() {
    const pigeonName = name.trim()
    if (!pigeonName) {
      setMessage('给它取个名字吧')
      return
    }
    setBusy(true)
    setMessage('')
    const { error } = await supabase.from('pigeons').insert({
      pair_id: pair.id,
      name: pigeonName,
    })
    if (error) {
      // unique 约束：对方刚好也在领养，一个空间只能有一只鸽子
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        setMessage('对方已经领养好啦，正在带它过来…')
        onChanged()
      } else {
        setMessage('领养失败：' + error.message)
      }
    } else {
      onChanged()
    }
    setBusy(false)
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white/70 backdrop-blur-md p-8 shadow-lg text-center">
      <img
        src="/pigeon.png"
        alt="一只信鸽"
        draggable="false"
        className="pigeon-bob mx-auto mb-4 h-24 w-auto"
        style={{ filter: 'drop-shadow(0 8px 12px rgba(60,80,110,0.25))' }}
      />
      <h2 className="text-2xl text-sky-900 mb-2 tracking-widest">一只信鸽落在了窗台</h2>
      <p className="text-sm text-sky-700 mb-6">
        它将往返于你们的两扇窗之间<br />先给它取个名字吧（谁先想好谁来填）
      </p>

      <input
        type="text"
        placeholder="鸽子的名字"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={10}
        className="w-full rounded-lg border border-sky-200 bg-white/80 px-4 py-2.5 text-center text-sky-900 placeholder-sky-400 outline-none focus:border-sky-400"
      />

      <button
        onClick={adopt}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-sky-600 py-2.5 text-white tracking-widest hover:bg-sky-700 disabled:opacity-50 transition-colors"
      >
        {busy ? '请稍候…' : '就叫这个名字'}
      </button>

      {message && (
        <p className="mt-4 text-sm text-rose-500">{message}</p>
      )}
    </div>
  )
}

export default AdoptPage
