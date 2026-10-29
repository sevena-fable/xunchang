// 历史召唤应答组件，当前 HomePage 未引用。
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { SUMMON_TIMEOUT_MS } from '../lib/pigeon'
import Panel, { PrimaryButton, GhostButton } from './Panel'
import { BrassBell } from './Glyphs'
import { sfxBell } from '../lib/sfx'

function SummonListener({ pair, userId, pigeon, partnerNickname, onChanged }) {
  const [req, setReq] = useState(null) // 待我应答的召唤请求
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true

    // 进来时先看有没有"刚发起、还没过期"的待应答请求（比如我刚打开页面）
    async function loadPending() {
      const since = new Date(Date.now() - SUMMON_TIMEOUT_MS).toISOString()
      const { data } = await supabase
        .from('summon_requests').select('*')
        .eq('pair_id', pair.id).eq('status', 'pending')
        .neq('requester_id', userId)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      if (active && data) { setReq(data); sfxBell() }
    }
    loadPending()

    // 实时监听：对方新发起 → 弹出；请求被取消/超时/已处理 → 收起
    const channel = supabase
      .channel(`summon-in-${pair.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'summon_requests', filter: `pair_id=eq.${pair.id}` },
        (payload) => {
          const row = payload.new || payload.old
          if (!row) return
          if (payload.eventType === 'INSERT' && row.requester_id !== userId && row.status === 'pending') {
            setReq(row)
            sfxBell()
          } else if (payload.eventType === 'UPDATE') {
            setReq((cur) => (cur && cur.id === row.id && row.status !== 'pending') ? null : cur)
          }
        })
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [pair.id, userId])

  async function respond(approve) {
    if (!req) return
    setBusy(true)
    await supabase.from('summon_requests')
      .update({ status: approve ? 'approved' : 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', req.id).eq('status', 'pending')
    setBusy(false)
    setReq(null)
    onChanged()
  }

  return (
    <Panel
      open={!!req}
      onClose={() => respond(false)}
      title="有 铃 声"
      subtitle={`${partnerNickname || '对方'} 摇响了铃铛`}
      width="max-w-sm"
    >
      <div className="flex flex-col items-center text-center">
        <motion.div
          className="mb-5"
          style={{ transformOrigin: '50% 8%', filter: 'drop-shadow(0 5px 10px rgba(120,90,40,0.35))' }}
          animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.4 }}
        >
          <BrassBell size={52} />
        </motion.div>
        <p className="mb-6 text-sm leading-7 text-[var(--panel-muted)]">
          铃声是从对面那扇窗传来的。<br />
          要放 {pigeon.name} 飞过去吗？
        </p>
        <div className="panel-actions justify-center">
          <GhostButton onClick={() => respond(false)} disabled={busy}>再留一会儿</GhostButton>
          <PrimaryButton onClick={() => respond(true)} disabled={busy}>让它飞过去</PrimaryButton>
        </div>
      </div>
    </Panel>
  )
}

export default SummonListener
