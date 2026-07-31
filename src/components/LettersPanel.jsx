// 桌上的信 —— 未读的新信、我封存待寄的信、以及所有往来
import { motion } from 'framer-motion'
import { getStationery } from '../lib/stationery'
import { reactionOf } from '../lib/letters'
import Panel from './Panel'

function LettersPanel({ open, onClose, userId, unread, mySealed, history, reactions, onRead, pigeonName }) {
  const hasAnything = unread.length || mySealed.length || history.length

  return (
    <Panel
      open={open}
      onClose={onClose}
      title="桌 上 的 信"
      subtitle={unread.length ? `有 ${unread.length} 封还没拆开` : '都读过了'}
      width="max-w-xl"
    >
      <div className="thin-scroll max-h-[62vh] space-y-6 overflow-y-auto pr-1">
        {!hasAnything && (
          <p className="py-10 text-center text-sm leading-7 text-[#9c8663]">
            桌上还空着。<br />写下第一封吧，{pigeonName} 会替你送过去。
          </p>
        )}

        {unread.length > 0 && (
          <Section label={`新 到 的 信 · ${unread.length}`}>
            {unread.map((l, i) => (
              <LetterRow key={l.id} letter={l} index={i} unread onClick={() => onRead(l)} />
            ))}
          </Section>
        )}

        {mySealed.length > 0 && (
          <Section label="你封存的信 · 还没寄出">
            {mySealed.map((l, i) => (
              <LetterRow key={l.id} letter={l} index={i} sealed onClick={() => onRead(l)} />
            ))}
          </Section>
        )}

        {history.length > 0 && (
          <Section label="往 来">
            {history.map((l, i) => (
              <LetterRow
                key={l.id}
                letter={l}
                index={i}
                mine={l.sender_id === userId}
                reaction={reactions[l.id]}
                onClick={() => onRead(l)}
              />
            ))}
          </Section>
        )}
      </div>
    </Panel>
  )
}

function Section({ label, children }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] tracking-[0.28em] text-[#a8916b]">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

// 一封信的小卡片：左边一枚火漆点，右边日期，中间是开头几个字
function LetterRow({ letter, index, unread, sealed, mine, reaction, onClick }) {
  const style = getStationery(letter.stationery)
  const isNight = letter.stationery === 'night'
  const text = letter.content?.trim()
  const images = Array.isArray(letter.images) ? letter.images : []
  const preview = text
    ? (text.length > 22 ? text.slice(0, 22) + '…' : text)
    : (images.length ? `${images.length} 张照片` : '（没有写字）')
  const date = new Date(letter.sealed_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  const r = reaction ? reactionOf(reaction.emoji) : null

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.04 }}
      whileHover={{ x: 3 }}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-left shadow-sm transition-shadow hover:shadow-md"
      style={{
        background: style.paper,
        border: `1px solid ${style.border}`,
        outline: unread ? '2px solid rgba(196,124,66,0.55)' : 'none',
        outlineOffset: 1,
      }}
    >
      {/* 火漆点：没拆的是红的，拆过的是淡的 */}
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          background: unread ? '#b8402f' : sealed ? '#c9a961' : isNight ? '#5d6b91' : '#cbbca0',
          boxShadow: unread ? '0 0 8px rgba(184,64,47,0.6)' : 'none',
        }}
      />
      <span className="flex-1 truncate text-sm" style={{ color: style.ink }}>{preview}</span>
      {images.length > 0 && <span className="text-xs opacity-40" style={{ color: style.ink }}>📎</span>}
      {r && <span className="text-sm">{r.icon}</span>}
      <span className="shrink-0 text-[11px] opacity-45" style={{ color: style.ink }}>
        {mine ? '寄出 · ' : ''}{date}
      </span>
    </motion.button>
  )
}

export default LettersPanel
