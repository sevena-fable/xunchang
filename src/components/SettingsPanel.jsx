// 设置 —— 藏在画面角落，平时不打扰
// 能改：鸽子怎么称呼你、你的昵称；能看：空间的邀请码；能做：退出登录。
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Panel, { PrimaryButton, GhostButton } from './Panel'
import { sfxTap } from '../lib/sfx'

function SettingsPanel({ open, onClose, userId, profile, pair, pigeon, myCallField, partnerNickname, onChanged }) {
  const [call, setCall] = useState(pigeon[myCallField] || '')
  const [nickname, setNickname] = useState(profile.nickname || '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')

  // 每次打开都同步成数据库里的最新值，免得显示的是上次编辑到一半的字
  useEffect(() => {
    if (open) {
      setCall(pigeon[myCallField] || '')
      setNickname(profile.nickname || '')
      setSaved('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function save() {
    setBusy(true); setSaved('')
    const now = new Date().toISOString()
    if (call.trim() !== (pigeon[myCallField] || '')) {
      await supabase.from('pigeons')
        .update({ [myCallField]: call.trim(), updated_at: now })
        .eq('id', pigeon.id)
    }
    if (nickname.trim() && nickname.trim() !== profile.nickname) {
      await supabase.from('profiles')
        .update({ nickname: nickname.trim() })
        .eq('id', userId)
    }
    setBusy(false)
    setSaved('记住了')
    onChanged()
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <Panel open={open} onClose={onClose} title="窗 台 设 置" subtitle="只有你能看到这一页" width="max-w-md">
      <div className="space-y-5">
        <Field label={`${pigeon.name} 怎么称呼你`} hint="它每次蹭你的时候会喊这个">
          <input
            value={call}
            onChange={(e) => setCall(e.target.value.slice(0, 10))}
            placeholder="比如：小羽的主人"
            className="w-full rounded-lg border border-[#d6c4a2] bg-white/60 px-3 py-2 text-sm text-[#5b4a34] outline-none transition-colors placeholder:text-[#b9a888] focus:border-[#a8894f]"
          />
        </Field>

        <Field label="你的昵称" hint="对方看到的名字">
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 12))}
            className="w-full rounded-lg border border-[#d6c4a2] bg-white/60 px-3 py-2 text-sm text-[#5b4a34] outline-none transition-colors focus:border-[#a8894f]"
          />
        </Field>

        <div className="rounded-xl border border-[#d6c4a2]/70 bg-white/40 px-4 py-3 text-sm leading-7 text-[#6b563b]">
          <p>这扇窗属于 <b>{profile.nickname || '你'}</b> 与 <b>{partnerNickname || '对方'}</b></p>
          <p className="text-xs text-[#9c8663]">
            邀请码 <span className="tracking-[0.2em]">{pair.invite_code}</span> · 鸽子 {pigeon.name}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => { sfxTap(); logout() }}
            className="text-[11px] tracking-widest text-[#b3a181] underline underline-offset-4 transition-colors hover:text-[#8a6b3d]"
          >
            离开窗台（退出登录）
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-[#8a6b3d]">{saved}</span>}
            <GhostButton onClick={onClose}>关 上</GhostButton>
            <PrimaryButton onClick={save} disabled={busy}>{busy ? '…' : '记 住'}</PrimaryButton>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-xs tracking-[0.2em] text-[#8a7558]">{label}</span>
        {hint && <span className="text-[11px] text-[#b3a181]">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export default SettingsPanel
