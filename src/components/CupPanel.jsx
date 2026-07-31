// 茶杯 —— 听一点窗外的声音（规则 6.4）
// 雨 / 风 / 炉火 / 鸟鸣，全部是现场合成的声音，没有音频文件、没有版权问题。
import { motion } from 'framer-motion'
import { AMBIENCES } from '../lib/ambient'
import Panel from './Panel'
import { sfxTap } from '../lib/sfx'

function CupPanel({ open, onClose, ambience, volume, onPick, onVolume }) {
  const current = AMBIENCES.find((a) => a.key === ambience) || AMBIENCES[0]

  return (
    <Panel
      open={open}
      onClose={onClose}
      title="茶 杯"
      subtitle={ambience === 'off' ? '此刻只有安静' : `正在听 · ${current.label}`}
      width="max-w-md"
    >
      <div className="flex flex-col items-center">
        {/* 杯口的热气：有声音时才升起来 */}
        <div className="relative mb-1 h-10 w-16">
          {ambience !== 'off' && [0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 h-6 w-1 rounded-full bg-[#c9b590]"
              style={{ left: 16 + i * 12 }}
              animate={{ opacity: [0, 0.5, 0], y: [0, -22], scaleY: [0.6, 1.2] }}
              transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.7, ease: 'easeOut' }}
            />
          ))}
        </div>
        <div className="mb-6" style={{ filter: 'drop-shadow(0 5px 10px rgba(120,90,40,0.3))' }}>
          <TeaCup />
        </div>

        {/* 五个选择 */}
        <div className="grid w-full grid-cols-5 gap-2">
          {AMBIENCES.map((a) => {
            const active = a.key === ambience
            return (
              <button
                key={a.key}
                onClick={() => { sfxTap(); onPick(a.key) }}
                className={`flex flex-col items-center gap-1.5 rounded-xl py-3 transition-all ${active ? 'scale-[1.04] shadow-md' : 'opacity-65 hover:opacity-100'}`}
                style={{
                  background: active ? 'rgba(255,255,255,0.6)' : 'transparent',
                  border: `1px solid ${active ? '#c09a5e' : 'rgba(190,164,120,0.4)'}`,
                }}
              >
                <span className="flex h-6 items-center justify-center"><Glyph name={a.key} /></span>
                <span className="text-[11px] tracking-wider text-[#6b563b]">{a.label}</span>
              </button>
            )
          })}
        </div>

        {/* 音量 */}
        <div className="mt-6 flex w-full items-center gap-3">
          <span className="text-[11px] tracking-widest text-[#a8916b]">轻</span>
          <input
            type="range"
            min="0.02" max="0.42" step="0.01"
            value={volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            disabled={ambience === 'off'}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[#dcc9a3] accent-[#8a6b3d] disabled:opacity-40"
          />
          <span className="text-[11px] tracking-widest text-[#a8916b]">响</span>
        </div>

        <p className="mt-5 text-center text-[11px] leading-6 text-[#b3a181]">
          这些声音是程序现场"拉"出来的，<br />所以每一秒的雨都不重样。
        </p>
      </div>
    </Panel>
  )
}

// 桌上那只青花瓷杯（手画 SVG，和背景图里的杯子同一家）
function TeaCup() {
  // 一朵五瓣小花：中心一点，外面五片花瓣绕一圈
  const blossom = (cx, cy, s) => (
    <g key={`${cx}-${cy}`}>
      {[234, 306, 18, 90, 162].map((deg) => {
        const rad = (deg * Math.PI) / 180
        return (
          <circle
            key={deg}
            cx={cx + 2.5 * s * Math.cos(rad)}
            cy={cy + 2.5 * s * Math.sin(rad)}
            r={1.45 * s}
          />
        )
      })}
      <circle cx={cx} cy={cy} r={0.85 * s} fill="rgba(58,88,140,0.62)" />
    </g>
  )

  return (
    <svg width="104" height="78" viewBox="0 0 104 78" aria-hidden="true">
      <defs>
        <linearGradient id="cup-porcelain" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="58%" stopColor="#f3f1ea" />
          <stop offset="100%" stopColor="#dcd8cc" />
        </linearGradient>
      </defs>
      {/* 茶托 */}
      <ellipse cx="52" cy="70" rx="36" ry="6.4" fill="#e6e2d6" />
      <ellipse cx="52" cy="68.6" rx="36" ry="6" fill="url(#cup-porcelain)" />
      {/* 杯把 */}
      <path d="M78 30c9 0 13 5 13 11s-4.4 11-13 11" fill="none" stroke="#e2ded1" strokeWidth="6" strokeLinecap="round" />
      <path d="M78 30c9 0 13 5 13 11s-4.4 11-13 11" fill="none" stroke="url(#cup-porcelain)" strokeWidth="4" strokeLinecap="round" />
      {/* 杯身 */}
      <path d="M20 26h58l-4.6 30c-.7 4.6-4.6 8-9.2 8H33.8c-4.6 0-8.5-3.4-9.2-8L20 26z" fill="url(#cup-porcelain)" />
      {/* 青花：两道弦纹 + 一小枝梅（不是随机的点，是一枝花） */}
      <path d="M22.6 34.5h52.8" stroke="rgba(74,106,158,0.5)" strokeWidth="1.4" />
      <path d="M23.4 38h51.2" stroke="rgba(74,106,158,0.22)" strokeWidth="1" />
      <g fill="none" stroke="rgba(74,106,158,0.4)" strokeWidth="1.1" strokeLinecap="round">
        <path d="M32.6 57.4c4-.6 7.4-2.8 10-6.4" />
        <path d="M43.4 51.6c3.4 1 6.6.8 9.6-.8" />
        <path d="M38.4 53.8c-.4-1.8-1.4-3-2.8-3.6" />
      </g>
      <g fill="rgba(74,106,158,0.4)">
        {blossom(43.8, 48.6, 1)}
        {blossom(55.4, 48, 0.82)}
      </g>
      {/* 杯口的茶汤 */}
      <ellipse cx="49" cy="26" rx="29" ry="6.4" fill="#efece2" />
      <ellipse cx="49" cy="26" rx="25.6" ry="5" fill="#a9793c" />
      <ellipse cx="49" cy="25.4" rx="25.6" ry="4.6" fill="#c1904d" />
      <ellipse cx="41" cy="24.4" rx="7" ry="1.6" fill="rgba(255,240,205,0.4)" />
    </svg>
  )
}

// 五个选项的小图标：细线条，比 emoji 安静
function Glyph({ name }) {
  const p = {
    width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
    stroke: '#7a6242', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
  }
  if (name === 'rain') return (
    <svg {...p}><path d="M6 11a4.2 4.2 0 0 1 1.2-8 5 5 0 0 1 9.3.6A3.7 3.7 0 0 1 18 11H6z" /><path d="M8 15l-1 3M12 15l-1 3.6M16 15l-1 3" /></svg>
  )
  if (name === 'wind') return (
    <svg {...p}><path d="M3 9h11a3 3 0 1 0-3-3" /><path d="M3 14h8a2.6 2.6 0 1 1-2.6 2.6" /><path d="M17 14h3" /></svg>
  )
  if (name === 'fire') return (
    <svg {...p}>
      {/* 外焰：一边高一边低，才像在烧；里面再套一小簇内焰 */}
      <path d="M13.2 3.2c.5 3.1 4.3 5.2 4.3 9.4A5.5 5.5 0 0 1 12 20.6a5.5 5.5 0 0 1-5.5-8c.3 1.1 1.1 1.8 2.1 2 0-2.8.9-5 4.6-11.4z" />
      <path d="M12 20.6a2.7 2.7 0 0 1-2.7-2.8c0-1.7 1.4-2.5 2-4 1.1 1.1 2.8 2.3 2.8 4a2.7 2.7 0 0 1-2.1 2.8z" />
    </svg>
  )
  if (name === 'birds') return (
    <svg {...p}><path d="M3 8c2.6 0 4 1.6 4.6 3.4" /><path d="M7.6 11.4c1.6-3.4 4.4-5.2 7.6-5.2 2.4 0 4 1 5.8 2.6-1.4.4-2.2 1-2.6 2 .8.4 1.2 1 1.4 1.8-3 3.6-6.4 5.4-10.2 5.4-1.4 0-2.4-.2-3.2-.6 1-1.6 1.4-3.4 1.2-6z" /><path d="M15.6 8.4h.01" /></svg>
  )
  // 安静：一只小杯子
  return (
    <svg {...p}><path d="M5 7h11l-1 9.4A3 3 0 0 1 12 19H9a3 3 0 0 1-3-2.6L5 7z" /><path d="M16 9.4c2 0 3 1 3 2.4s-1 2.4-3 2.4" /><path d="M5.6 10.4h10" /></svg>
  )
}

export default CupPanel
