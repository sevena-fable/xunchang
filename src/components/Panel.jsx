// 统一的弹窗外壳 —— 所有面板共用同一种质感：暖纸色、木框、柔和的浮起
// 好处：视觉统一，以后想换风格只改这一个文件
import { AnimatePresence, motion } from 'framer-motion'
import { sfxTap } from '../lib/sfx'

function Panel({ open, title, subtitle, onClose, children, width = 'max-w-lg', tone = 'paper' }) {
  // 两种色调：paper 温暖信纸（常用）、night 深色（读夜空信纸时更搭）
  // 面板最高只到画面的 92%，超出就在面板内部滚 —— 短窗口（笔记本、手机）不会把按钮截掉
  const skin = tone === 'night'
    ? { bg: 'rgba(38,44,66,0.94)', border: 'rgba(120,136,180,0.4)', ink: '#e8eef9', sub: 'rgba(232,238,249,0.55)' }
    : { bg: 'rgba(250,244,231,0.95)', border: 'rgba(190,164,120,0.5)', ink: '#5b4a34', sub: 'rgba(91,74,52,0.6)' }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28 }}
          className="absolute inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: 'rgba(28,20,10,0.42)', backdropFilter: 'blur(6px)' }}
          onClick={() => { sfxTap(); onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.34, ease: [0.22, 0.9, 0.24, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full ${width} thin-scroll max-h-[92%] overflow-y-auto rounded-[20px] p-6 shadow-[0_24px_70px_rgba(30,18,4,0.5)]`}
            style={{
              background: skin.bg,
              border: `1px solid ${skin.border}`,
              backdropFilter: 'blur(10px)',
            }}
          >
            {(title || subtitle) && (
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  {title && (
                    <h3 className="text-lg tracking-[0.18em]" style={{ color: skin.ink }}>{title}</h3>
                  )}
                  {subtitle && (
                    <p className="mt-1 text-xs tracking-wider" style={{ color: skin.sub }}>{subtitle}</p>
                  )}
                </div>
                <button
                  onClick={() => { sfxTap(); onClose() }}
                  className="shrink-0 rounded-full px-2 py-0.5 text-sm opacity-50 transition-opacity hover:opacity-100"
                  style={{ color: skin.ink }}
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// 面板里通用的主按钮 / 次按钮，省得每处重写样式
export function PrimaryButton({ children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      className={`rounded-xl bg-[#8a6b3d] px-6 py-2.5 text-sm tracking-[0.18em] text-amber-50 shadow-md transition-all hover:bg-[#755a31] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className = '', ...rest }) {
  return (
    <button
      {...rest}
      className={`rounded-xl border border-[#c3ac82]/70 px-6 py-2.5 text-sm tracking-[0.18em] text-[#6b563b] transition-colors hover:bg-[#e8dcc0]/50 disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  )
}

export default Panel
