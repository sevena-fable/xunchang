import { useEffect, useRef, useState } from 'react'
import Panel, { PrimaryButton, GhostButton } from './Panel'
import { toggleBgm, useBgmPlaying } from '../lib/bgm'
import SongGiftForm from './SongGiftForm'

export default function SettingsPanel({ open, onClose, profile, pair, partnerNickname, onSave, onLogout, songGiftActions }) {
  const bgmPlaying = useBgmPlaying()
  const [nickname, setNickname] = useState(profile.nickname || '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const alive = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (open) { setNickname(profile.nickname || ''); setMessage('') }
  }, [open, profile.nickname])

  async function run(action, success) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try { await action(); if (alive.current) setMessage(success); return true }
    catch (error) { if (alive.current) setMessage('操作未完成：' + error.message); return false }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }

  function save() {
    if (!nickname.trim()) { setMessage('昵称不能为空'); return }
    run(() => onSave(nickname.trim()), '已保存')
  }
  const close = () => { if (!lock.current) onClose() }
  return (
    <Panel open={open} onClose={close} title="设置" width="max-w-lg">
      <label className="block text-sm text-[var(--panel-muted)]">你的昵称
        <input aria-label="你的昵称" value={nickname} disabled={busy} maxLength={12} onChange={(event) => setNickname(event.target.value)} className="panel-input mt-2" />
      </label>
      <div className="panel-box my-5 px-4 py-3 text-sm leading-7">
        <p>与你分享文字的人是 {partnerNickname || '（对方还没填昵称）'}</p>
        <p className="text-xs text-[var(--panel-muted)]">邀请码 <span className="tracking-widest text-[var(--panel-ink)]">{pair.invite_code}</span></p>
      </div>
      <div className="settings-music mb-5 border-b border-[var(--panel-border)] pb-4 text-sm">
        <span>背景音乐</span>
        <button type="button" onClick={toggleBgm} aria-label={bgmPlaying ? '静音背景音乐' : '播放背景音乐'} aria-pressed={bgmPlaying} className="settings-toggle" />
      </div>
      {open && songGiftActions && <SongGiftForm busy={busy} pair={pair} userId={profile.id} actions={songGiftActions} runAction={run} />}
      <p className="min-h-5 text-sm" role="status">{message}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <button type="button" disabled={busy} onClick={() => run(onLogout, '已离开桌前')} className="panel-link text-xs">退出登录</button>
        <div className="panel-actions">
          <GhostButton onClick={close} disabled={busy}>关闭</GhostButton>
          <PrimaryButton onClick={save} disabled={busy}>{busy ? '请稍候…' : '保存'}</PrimaryButton>
        </div>
      </div>
    </Panel>
  )
}
