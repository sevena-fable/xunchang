// 共用的手绘 SVG 图标，包含当前与历史组件使用的图形。

// 历史火漆图案：羽毛。当前阅读分享入口未使用此图标。
export function Feather({ size = 22, color = 'rgba(255,238,218,0.88)', stroke = 1.4 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.4 18.6c-.4-6 3.4-12.2 9.2-14.4 1.8 3.8 1.4 9.2-1.8 12.2-2.2 2-4.8 2.4-7.4 2.2z" />
      <path d="M6.4 18.6 13.6 11" />
    </svg>
  )
}

// 桌上那只黄铜手铃：铃铛面板和"有铃声"弹窗共用一只
export function BrassBell({ size = 72 }) {
  return (
    <svg width={size} height={(size * 76) / 64} viewBox="0 0 64 76" aria-hidden="true">
      <defs>
        <linearGradient id="bell-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f6e0a6" />
          <stop offset="38%" stopColor="#d9ab52" />
          <stop offset="72%" stopColor="#b3822f" />
          <stop offset="100%" stopColor="#8d6423" />
        </linearGradient>
        <linearGradient id="bell-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8a6a44" />
          <stop offset="100%" stopColor="#5d4527" />
        </linearGradient>
      </defs>
      {/* 把手 */}
      <ellipse cx="32" cy="7" rx="4.6" ry="4.2" fill="url(#bell-wood)" />
      <rect x="29.8" y="9" width="4.4" height="11" rx="2.2" fill="url(#bell-wood)" />
      <rect x="27" y="19" width="10" height="4" rx="2" fill="url(#bell-brass)" />
      {/* 铃身 */}
      <path
        d="M32 22c-9.4 0-15.6 12.6-17.4 32.4-.2 2 1.2 3.6 3.2 3.6h28.4c2 0 3.4-1.6 3.2-3.6C47.6 34.6 41.4 22 32 22z"
        fill="url(#bell-brass)"
      />
      {/* 铜面上的一道高光 */}
      <path d="M26 26c-3.6 6-6 16-6.8 27" stroke="rgba(255,248,222,0.55)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {/* 铃口与铃舌 */}
      <ellipse cx="32" cy="58" rx="17.4" ry="4.6" fill="#a9791f" />
      <ellipse cx="32" cy="57.2" rx="17.4" ry="4.2" fill="url(#bell-brass)" />
      <ellipse cx="32" cy="58.4" rx="9" ry="2.4" fill="rgba(80,54,14,0.45)" />
      <circle cx="32" cy="63.6" r="3.4" fill="#7d5a1c" />
    </svg>
  )
}

// 一封小小的牛皮纸信，封口一点火漆。用在鸽子身边（守信）和别的小尺寸位置。
// 不传 size 时它会把宽度撑成父容器的 100%，高度按比例自己算——
// 这样它就能跟着鸽子一起随画面缩放，而不会在大屏上变成一小点。
export function TinyLetter({ size }) {
  const dim = size ? { width: size, height: (size * 15) / 20 } : { width: '100%' }
  return (
    <svg viewBox="0 0 20 15" {...dim} aria-hidden="true">
      <rect x="0.6" y="0.6" width="18.8" height="13.8" rx="1.6" fill="#f6ead0" stroke="#cbb083" strokeWidth="1" />
      <path d="M1.4 2 10 8.2 18.6 2" fill="none" stroke="#cbb083" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="10" cy="9.6" r="2.2" fill="#b9452f" />
      <circle cx="9.3" cy="8.9" r="0.7" fill="rgba(255,225,205,0.5)" />
    </svg>
  )
}
