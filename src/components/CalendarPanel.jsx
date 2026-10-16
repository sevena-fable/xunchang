// 台历 —— 有通信的日子会自动落下一枚小信封（规则 7）
// 纯自动沉淀：你什么都不用记，写过信的日子自己会留在这本台历上。
import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { dayKey } from '../lib/letterFormat'
import { getStationery } from '../lib/stationery'
import Panel from './Panel'
import { sfxTap, sfxPaper } from '../lib/sfx'

const WEEK = ['日', '一', '二', '三', '四', '五', '六']

function CalendarPanel({ open, onClose, history, unread = [], mySealed = [], userId, onRead }) {
  const today = new Date()
  const reducedMotion = useReducedMotion()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [picked, setPicked] = useState(null)

  // 把所有信按"日子"归堆：{ '2026-07-31': [信, 信] }
  const byDay = useMemo(() => {
    const map = {}
    history.forEach((l) => {
      const k = dayKey(l.sealed_at)
      ;(map[k] ||= []).push(l)
    })
    return map
  }, [history])

  // 这个月的格子：前面补空格，让 1 号落在正确的星期下
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1)
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate()
    const pad = first.getDay()
    return [...Array(pad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  }, [cursor])

  function move(step) {
    sfxPaper()
    setPicked(null)
    setCursor(({ y, m }) => {
      const d = new Date(y, m + step, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const monthKey = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`
  const pickedLetters = picked ? (byDay[picked] || []) : []
  const monthCount = Object.keys(byDay).filter((k) => k.startsWith(monthKey)).length

  return (
    <Panel
      open={open}
      onClose={() => { setPicked(null); onClose() }}
      title="台 历"
      subtitle={monthCount ? '分享过的日常，都在这里' : '这个月还很安静'}
      width="max-w-md"
    >
      {[[unread, '还没看过'], [mySealed, '还未分享']].map(([items, label]) => items.length > 0 && (
        <details key={label} open className="mb-4" aria-label={label}>
          <summary className="mb-2 cursor-pointer text-sm">{label} · {items.length}</summary>
          <div className="thin-scroll max-h-32 space-y-2 overflow-y-auto">
            {items.map((letter) => <button key={letter.id} onClick={() => onRead(letter)} className="flex w-full gap-3 rounded-lg border border-[#bac3d4] bg-[#edf0f4] px-3 py-2 text-left text-sm"><span className="shrink-0 text-xs">{dayKey(letter.sealed_at)}</span><span className="truncate">{letter.content.trim() || '（照片）'}</span></button>)}
          </div>
        </details>
      ))}
      {/* 台历上方的铁圈 */}
      <div className="mb-3 flex justify-center gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'linear-gradient(180deg,#d6dce6,#857c91)', boxShadow: 'inset 0 -1px 1px rgba(255,255,255,0.6)' }}
          />
        ))}
      </div>

      {/* 月份切换 */}
      <div className="mb-4 flex items-center justify-between px-1">
        <button onClick={() => move(-1)} className="px-2 text-lg text-[#857c91] transition-colors hover:text-[#4a4358]" aria-label="上个月">‹</button>
        <div className="text-center">
          <p className="text-2xl tracking-[0.1em] text-[#4a4358]">
            {String(cursor.m + 1).padStart(2, '0')}
            <span className="ml-2 text-xs tracking-[0.28em] text-[#857c91]">{cursor.y}</span>
          </p>
        </div>
        <button onClick={() => move(1)} className="px-2 text-lg text-[#857c91] transition-colors hover:text-[#4a4358]" aria-label="下个月">›</button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] tracking-widest text-[#9c95a8]">
        {WEEK.map((w) => <span key={w} className="py-1">{w}</span>)}
      </div>

      {/* 日子 */}
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <span key={`p${i}`} />
          const key = `${monthKey}-${String(d).padStart(2, '0')}`
          const items = byDay[key]
          const isToday =
            d === today.getDate() && cursor.m === today.getMonth() && cursor.y === today.getFullYear()
          const isPicked = picked === key
          return (
            <button
              key={key}
              aria-label={`${key}${items ? `，${items.length} 条内容` : ''}${items?.some((letter) => unread.some((item) => item.id === letter.id)) ? '，有未读' : ''}`}
              onClick={() => { sfxTap(); setPicked(isPicked ? null : (items ? key : null)) }}
              className="relative flex h-10 flex-col items-center justify-center rounded-lg text-sm transition-colors"
              style={{
                color: items ? '#4a4358' : '#b0aab9',
                background: isPicked ? 'rgba(216,180,182,0.5)' : items ? 'rgba(237,240,244,0.9)' : 'transparent',
                border: isToday ? '1px solid rgba(133,124,145,0.6)' : '1px solid transparent',
                cursor: items ? 'pointer' : 'default',
              }}
            >
              {d}
              {items && (
                <motion.span
                  initial={reducedMotion ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute bottom-1 h-[3.5px] w-[3.5px] rounded-full"
                  style={{ background: '#c48c92', boxShadow: '0 0 0 1px rgba(247,242,238,0.9)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 点开某一天，看那天的信 */}
      <AnimatePresence mode="wait">
        {picked && (
          <motion.div
            key={picked}
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reducedMotion ? { duration: 0 } : undefined}
            className="overflow-hidden"
          >
            <p className="mb-2 mt-5 text-[11px] tracking-[0.28em] text-[#857c91]">
              {picked.slice(5).replace('-', ' 月 ')} 日 · {pickedLetters.length} 条
            </p>
            <div className="thin-scroll flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
              {pickedLetters.map((l) => {
                const style = getStationery(l.stationery)
                const text = l.content?.trim()
                const preview = text ? (text.length > 20 ? text.slice(0, 20) + '…' : text) : '（照片）'
                return (
                  <button
                    key={l.id}
                    onClick={() => { sfxTap(); onRead(l) }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-transform hover:translate-x-0.5"
                    style={{ background: style.paper, border: `1px solid ${style.border}`, color: style.ink }}
                  >
                    <span className="text-xs opacity-50">{l.sender_id === userId ? '你分享的' : '对方分享的'}</span>
                    <span className="flex-1 truncate">{preview}</span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!picked && (
        <p className="mt-5 text-center text-[11px] tracking-widest text-[#9c95a8]">
          点开标了红点的日子，看看分享过什么
        </p>
      )}
    </Panel>
  )
}

export default CalendarPanel
