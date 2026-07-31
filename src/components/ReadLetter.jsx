// 读信 —— 阶段五的开信仪式 + 阶段六的图片与回应
//   收到的新信：先看到一只封着火漆的信封，点一下才拆开，信纸从里面升起来
//   读过的信 / 自己封存的信：直接展开
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getStationery } from '../lib/stationery'
import { mySide } from '../lib/pigeon'
import { REACTIONS, reactionOf, deliverLetter, markRead, submitReaction } from '../lib/letters'
import { Feather } from './Glyphs'
import { sfxOpen, sfxPaper, sfxSeal, sfxTap, sfxReact } from '../lib/sfx'

function ReadLetter({ letter, userId, pair, pigeon, reaction, onClose, onChanged }) {
  const style = getStationery(letter.stationery)
  const isMine = letter.sender_id === userId
  const isSealedByMe = isMine && letter.status === 'sealed'
  const isNewToMe = !isMine && letter.status === 'delivered' // 收到的、还没读的

  // 只有"收到的新信"才走拆信仪式
  const [stage, setStage] = useState(isNewToMe ? 'sealed' : 'open')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')
  const [zoom, setZoom] = useState(null)   // 放大看的那张图
  const images = Array.isArray(letter.images) ? letter.images : []

  const side = mySide(pair, userId)
  const canSend = pigeon && pigeon.location === side
  const isNight = letter.stationery === 'night'

  async function finishRead() {
    await markRead(letter, pigeon, pair)
    onChanged()
  }

  // 拆信：火漆裂开 → 信封张口 → 信纸升起
  function openIt() {
    if (stage !== 'sealed') return
    sfxSeal()
    setStage('opening')
    setTimeout(() => sfxOpen(), 260)
    setTimeout(() => sfxPaper(), 820)
    setTimeout(() => { setStage('open'); finishRead() }, 1150)
  }

  async function sendSealed() {
    if (!canSend) {
      setSendMsg(`${pigeon?.name || '鸽子'} 此刻在对方窗台。先摇铃把它唤回来，才能寄出。`)
      return
    }
    setSending(true)
    await deliverLetter(letter, pigeon, side, pair)
    sfxSeal()
    setSending(false)
    onChanged()
    onClose()
  }

  const dateText = new Date(letter.sealed_at).toLocaleString('zh-CN', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: 'rgba(28,20,10,0.5)', backdropFilter: 'blur(7px)' }}
      onClick={() => { if (stage !== 'opening') { sfxTap(); onClose() } }}
    >
      <AnimatePresence mode="wait">
        {/* ——— 未拆的信封 ——— */}
        {stage !== 'open' ? (
          <motion.div
            key="envelope"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 1.06 }}
            transition={{ duration: 0.4, ease: [0.22, 0.9, 0.24, 1] }}
            onClick={(e) => { e.stopPropagation(); openIt() }}
            className="relative cursor-pointer select-none"
            style={{ width: 'min(86vw, 420px, calc(54vh * 1.55))', aspectRatio: '1.55' }}
          >
            {/* 从信封里升起的信纸 */}
            <motion.div
              className="absolute inset-x-6 bottom-6 rounded-sm shadow-md"
              style={{ background: style.paper, border: `1px solid ${style.border}`, height: '74%' }}
              animate={stage === 'opening' ? { y: '-46%' } : { y: 0 }}
              transition={{ duration: 0.7, delay: 0.42, ease: [0.3, 0.9, 0.3, 1] }}
            />
            {/* 信封身子（挡在信纸前面） */}
            <div
              className="absolute inset-0 rounded-lg shadow-[0_18px_44px_rgba(30,18,4,0.5)]"
              style={{
                background: 'linear-gradient(160deg, #e6d5b4 0%, #d8c39b 58%, #cdb68d 100%)',
                clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
                border: '1px solid #c0a97f',
                zIndex: 2,
              }}
            >
              {/* 信封正面的两道斜折线 */}
              <div className="absolute inset-0 overflow-hidden rounded-lg">
                <div className="absolute left-0 top-0 h-full w-full"
                  style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.25) 49.6%, rgba(160,135,95,0.28) 50%, transparent 50.4%)' }} />
                <div className="absolute left-0 top-0 h-full w-full"
                  style={{ background: 'linear-gradient(to bottom left, rgba(255,255,255,0.25) 49.6%, rgba(160,135,95,0.28) 50%, transparent 50.4%)' }} />
              </div>
            </div>
            {/* 信封盖：拆信时向上翻开 */}
            <motion.div
              className="absolute inset-x-0 top-0"
              style={{
                height: '62%',
                transformOrigin: 'top center',
                transformStyle: 'preserve-3d',
                background: 'linear-gradient(180deg, #eadcbe 0%, #dcc9a3 100%)',
                clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                zIndex: 3,
              }}
              animate={stage === 'opening' ? { rotateX: -168 } : { rotateX: 0 }}
              transition={{ duration: 0.55, ease: 'easeInOut' }}
            />
            {/* 火漆印：封蜡上压的是一根羽毛 */}
            <motion.div
              className="absolute left-1/2 flex items-center justify-center rounded-full"
              style={{
                top: '52%', width: 46, height: 46, marginLeft: -23,
                background: 'radial-gradient(circle at 36% 32%, #c85c4a, #8e2f22 72%, #6d2118)',
                boxShadow: '0 4px 12px rgba(90,25,16,0.5), inset 0 2px 5px rgba(255,255,255,0.22)',
                zIndex: 4,
              }}
              animate={stage === 'opening' ? { scale: [1, 1.14, 0], opacity: [1, 1, 0] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Feather size={22} />
            </motion.div>

            <AnimatePresence>
              {stage === 'sealed' && (
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 0.85 }} exit={{ opacity: 0 }}
                  className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs tracking-[0.3em] text-amber-50"
                  style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
                >
                  轻轻点一下，把它拆开
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          /* ——— 展开的信 ——— */
          <motion.div
            key="paper"
            initial={{ opacity: 0, scaleY: 0.86, y: 18 }}
            animate={{ opacity: 1, scaleY: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 0.9, 0.24, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="thin-scroll max-h-[88%] w-full max-w-xl overflow-y-auto rounded-[18px] p-7 shadow-[0_24px_70px_rgba(30,18,4,0.55)]"
            style={{
              background: style.paper,
              border: `1px solid ${style.border}`,
              backgroundImage: `repeating-linear-gradient(transparent, transparent 31px, ${style.border}80 32px)`,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <span className="text-[11px] tracking-widest opacity-55" style={{ color: style.ink }}>
                {isMine ? (isSealedByMe ? '你封存的信' : '你寄出的信') : '寄给你的信'} · {dateText}
              </span>
              <button
                onClick={() => { sfxTap(); onClose() }}
                className="text-sm opacity-50 transition-opacity hover:opacity-100"
                style={{ color: style.ink }}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            <div
              className="mt-5 min-h-[7rem] whitespace-pre-wrap text-[15px]"
              style={{ color: style.ink, lineHeight: '32px' }}
            >
              {letter.content}
            </div>

            {/* 信里夹的照片 */}
            {images.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-3">
                {images.map((url) => (
                  <motion.img
                    key={url}
                    src={url}
                    alt="信里夹的照片"
                    onClick={() => { sfxTap(); setZoom(url) }}
                    whileHover={{ scale: 1.03, rotate: 0 }}
                    className="h-28 w-28 cursor-zoom-in rounded-md object-cover shadow-md"
                    style={{ border: `3px solid ${style.paper}`, outline: `1px solid ${style.border}`, rotate: '-1.2deg' }}
                  />
                ))}
              </div>
            )}

            {/* 回应区（规则 5） */}
            <ReactionArea
              letter={letter}
              userId={userId}
              pair={pair}
              reaction={reaction}
              isMine={isMine}
              isSealedByMe={isSealedByMe}
              style={style}
              isNight={isNight}
              onChanged={onChanged}
            />

            <div className="mt-6 flex flex-col items-center gap-2">
              {sendMsg && <p className="text-xs text-rose-600/90">{sendMsg}</p>}
              <div className="flex justify-center gap-3">
                {isSealedByMe && (
                  <button
                    onClick={sendSealed}
                    disabled={sending}
                    className="rounded-xl bg-[#8a6b3d] px-7 py-2 text-sm tracking-[0.18em] text-amber-50 shadow-md transition-colors hover:bg-[#755a31] disabled:opacity-50"
                  >
                    {sending ? '请稍候…' : '让鸽子送去'}
                  </button>
                )}
                <button
                  onClick={() => { sfxTap(); onClose() }}
                  className="rounded-xl px-7 py-2 text-sm tracking-[0.18em] transition-colors"
                  style={{ color: style.ink, border: `1px solid ${style.border}` }}
                >
                  收好了
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 点开照片看大图 */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
            onClick={(e) => { e.stopPropagation(); setZoom(null) }}
          >
            <motion.img
              src={zoom}
              alt="放大的照片"
              initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="max-h-full max-w-full cursor-zoom-out rounded-lg shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// 回应：只有收信人能回应、一封信只能回一次、回过就不能改
function ReactionArea({ letter, userId, pair, reaction, isMine, isSealedByMe, style, isNight, onChanged }) {
  const [emoji, setEmoji] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (isSealedByMe) return null // 还没寄出的信，谈不上回应

  const line = `1px solid ${style.border}`

  // 已经有回应了：双方都只是看着它
  if (reaction) {
    const r = reactionOf(reaction.emoji)
    return (
      <div className="mt-7 rounded-xl px-4 py-3" style={{ border: line, background: isNight ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.45)' }}>
        <p className="text-[11px] tracking-widest opacity-50" style={{ color: style.ink }}>
          {isMine ? '对方的回应' : '你的回应'}
        </p>
        <div className="mt-2 flex items-center gap-3">
          {r && <span className="text-2xl">{r.icon}</span>}
          {reaction.note
            ? <span className="text-sm" style={{ color: style.ink }}>「{reaction.note}」</span>
            : r && <span className="text-xs opacity-55" style={{ color: style.ink }}>{r.label}</span>}
        </div>
      </div>
    )
  }

  // 我写的信、对方还没回应
  if (isMine) {
    return (
      <p className="mt-7 text-[11px] tracking-widest opacity-45" style={{ color: style.ink }}>
        还没有回应。它有它自己的节奏。
      </p>
    )
  }

  // 收到的信、还没回应：给一次机会
  async function commit() {
    if (!emoji && !note.trim()) { setErr('挑一个表情，或写一句话'); return }
    setBusy(true); setErr('')
    const error = await submitReaction({
      letterId: letter.id, pairId: pair.id, userId, emoji, note,
    })
    setBusy(false)
    if (error) { setErr('回应没送出去：' + error.message); return }
    sfxReact()
    onChanged()
  }

  return (
    <div className="mt-7 rounded-xl px-4 py-4" style={{ border: line, background: isNight ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.45)' }}>
      <p className="text-[11px] tracking-widest opacity-55" style={{ color: style.ink }}>
        回应一次 · 之后就不能改了
      </p>
      <div className="mt-3 flex items-center gap-2">
        {REACTIONS.map((r) => (
          <button
            key={r.key}
            onClick={() => { sfxTap(); setEmoji(emoji === r.key ? '' : r.key) }}
            title={r.label}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-xl transition-all ${
              emoji === r.key ? 'scale-110 shadow-md' : 'opacity-60 hover:opacity-100'
            }`}
            style={{ border: emoji === r.key ? `2px solid ${style.ink}` : line, background: emoji === r.key ? 'rgba(255,255,255,0.6)' : 'transparent' }}
          >
            {r.icon}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 20))}
          placeholder="想说一句就写在这里（20 字以内）"
          className="flex-1 rounded-lg bg-transparent px-3 py-2 text-sm outline-none placeholder:opacity-40"
          style={{ color: style.ink, border: line }}
        />
        <span className="w-10 text-right text-[11px] opacity-45" style={{ color: style.ink }}>{note.length}/20</span>
      </div>
      {err && <p className="mt-2 text-xs text-rose-600/90">{err}</p>}
      <div className="mt-4 text-right">
        <button
          onClick={commit}
          disabled={busy}
          className="rounded-xl bg-[#8a6b3d] px-6 py-2 text-sm tracking-[0.18em] text-amber-50 shadow-md transition-colors hover:bg-[#755a31] disabled:opacity-50"
        >
          {busy ? '请稍候…' : '送出这份心意'}
        </button>
      </div>
    </div>
  )
}

export default ReadLetter
