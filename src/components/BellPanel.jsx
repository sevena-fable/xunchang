// 铃铛面板 —— 摇铃召唤鸽子（规则 3.3）
//   鸽子在自己窗台：不必召唤，面板只说一句温柔的话
//   在对方处、对方在线：发起请求，等对方同意才飞回；拒绝或 60 秒无响应算失败
//   在对方处、对方离线：直接召回
// 注意：界面永不显示"对方在不在线"，在线状态只在这段逻辑内部用于决定走哪条路。
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { mySide, arrivePigeon, SUMMON_TIMEOUT_MS } from '../lib/pigeon'
import Panel, { PrimaryButton, GhostButton } from './Panel'
import { BrassBell } from './Glyphs'
import { sfxBell } from '../lib/sfx'

function BellPanel({ open, onClose, pair, userId, pigeon, partnerOnline, onChanged }) {
  const side = mySide(pair, userId)
  const atMyWindow = pigeon.location === side
  const [waiting, setWaiting] = useState(false)  // 正在等对方允许
  const [msg, setMsg] = useState('')
  const reqRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  // 每次重新打开面板，把上一次的提示清掉，界面干净
  useEffect(() => { if (open) setMsg('') }, [open])

  async function ring() {
    if (atMyWindow) return
    setMsg('')
    sfxBell()

    // 对方不在页面上：不必打扰谁，鸽子直接飞回
    if (!partnerOnline) {
      await arrivePigeon(pigeon, side, pair)
      setMsg(`${pigeon.name} 听见了，正朝你的窗台飞回来`)
      onChanged()
      return
    }

    // 对方正开着页面：先征得同意
    const { data, error } = await supabase.from('summon_requests').insert({
      pair_id: pair.id,
      requester_id: userId,
      status: 'pending',
    }).select().single()
    if (error) { setMsg('摇铃没响成功：' + error.message); return }

    reqRef.current = data
    setWaiting(true)
    setMsg('铃声传过去了，等它被放回来…')

    timerRef.current = setTimeout(async () => {
      await supabase.from('summon_requests')
        .update({ status: 'expired', resolved_at: new Date().toISOString() })
        .eq('id', data.id).eq('status', 'pending')
      setWaiting(false)
      setMsg('铃声没有得到回应。过一会儿再摇一次吧。')
    }, SUMMON_TIMEOUT_MS)
  }

  // 等待期间订阅这条请求的结果
  useEffect(() => {
    if (!waiting || !reqRef.current) return
    const id = reqRef.current.id
    const channel = supabase
      .channel(`summon-out-${id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'summon_requests', filter: `id=eq.${id}` },
        async (payload) => {
          const st = payload.new.status
          if (st === 'approved') {
            clearTimeout(timerRef.current)
            await arrivePigeon(pigeon, side, pair)
            setWaiting(false)
            setMsg(`它被放回来了，${pigeon.name} 正飞向你的窗台`)
            onChanged()
          } else if (st === 'rejected') {
            clearTimeout(timerRef.current)
            setWaiting(false)
            setMsg('它今天想在那边多待一会儿。')
          }
        })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [waiting, pigeon, side, pair, onChanged])

  async function cancel() {
    clearTimeout(timerRef.current)
    if (reqRef.current) {
      await supabase.from('summon_requests')
        .update({ status: 'cancelled', resolved_at: new Date().toISOString() })
        .eq('id', reqRef.current.id).eq('status', 'pending')
    }
    setWaiting(false)
    setMsg('')
  }

  return (
    <Panel
      open={open}
      onClose={onClose}
      title="铃 铛"
      subtitle={atMyWindow ? '它就在你的窗前' : `摇一摇，唤 ${pigeon.name} 回来`}
      width="max-w-sm"
    >
      <div className="flex flex-col items-center text-center">
        {/* 铃铛：能摇的时候会轻轻晃 */}
        <motion.button
          onClick={ring}
          disabled={atMyWindow || waiting}
          className="mb-5 leading-none disabled:cursor-default"
          style={{ transformOrigin: '50% 8%', filter: 'drop-shadow(0 5px 10px rgba(120,90,40,0.35))' }}
          animate={atMyWindow || waiting ? { rotate: 0 } : { rotate: [0, -9, 9, -5, 0] }}
          transition={atMyWindow || waiting ? {} : { duration: 2.4, repeat: Infinity, repeatDelay: 2.6 }}
          whileTap={{ scale: 0.92 }}
          aria-label="摇铃"
        >
          <BrassBell />
        </motion.button>

        {atMyWindow ? (
          <p className="text-sm leading-7 text-[#6b563b]">
            铃铛静静挂着。<br />
            {pigeon.name} 正在你的窗沿上，不用叫它。
          </p>
        ) : (
          <>
            <p className="mb-5 text-sm leading-7 text-[#6b563b]">
              它此刻不在你的窗台。<br />
              摇响铃铛，声音会穿过很远的地方找到它。
            </p>
            <div className="flex items-center gap-3">
              <PrimaryButton onClick={ring} disabled={waiting}>
                {waiting ? '铃声正在路上…' : '摇 铃'}
              </PrimaryButton>
              {waiting && <GhostButton onClick={cancel}>算了</GhostButton>}
            </div>
            <p className="mt-4 text-[11px] leading-6 text-[#8a7558]">
              若它正陪着对方，会先征得对方同意
            </p>
          </>
        )}

        {msg && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-sm text-[#8a6b3d]"
          >
            {msg}
          </motion.p>
        )}
      </div>
    </Panel>
  )
}

export default BellPanel
