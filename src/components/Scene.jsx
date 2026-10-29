// 寻常的窗边阅读桌面。
// 主页面就这一张图，一天任何时段打开都是它：不切四时、不飘云，
// 当前入口为纸笔（分享阅读摘录）和台历（回看分享内容）。
// 分层结构（从下到上）：
//   ① 世界层：单张背景图，光线都画在图里
//   ② 光层：四周极淡的暗角，画面有一点"照片感"，也衬得角落的小按钮看得清
//   ③ 交互层：物件热区（只留钢笔+信纸、台历两个），弹窗与角落 UI 由外面传进来
import { useMemo, useState } from 'react'
import { BG_MAIN, FRAME_RATIO, HOTSPOTS } from '../lib/scene'
import { sfxTap } from '../lib/sfx'

function Scene({ onOpen, debugHotspots, children, unreadCount = 0 }) {
  // 画面尺寸：始终保持整张图完整可见（用"取小值"让它在任何屏幕上都不裁切、不变形）
  const frameStyle = useMemo(() => ({
    width: `min(100vw, calc(100vh * ${FRAME_RATIO}))`,
    height: `min(100vh, calc(100vw / ${FRAME_RATIO}))`,
  }), [])

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#2a2433]">
      <div className="relative overflow-hidden shadow-[0_0_120px_rgba(42,36,51,0.6)]" style={frameStyle}>

        {/* ① 世界层：就一张图 */}
        <img
          src={BG_MAIN}
          alt="窗台"
          draggable="false"
          className="absolute inset-0 h-full w-full select-none object-fill"
        />

        {/* ② 光层：四周压一点极淡的暗角，视线自然聚到窗外；
            顶部再拿一道几乎看不见的渐变，让右上角的小齿轮总能看清 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 58%, rgba(74,67,88,0.16) 100%)',
              'linear-gradient(180deg, rgba(74,67,88,0.16) 0%, rgba(74,67,88,0.04) 8%, rgba(0,0,0,0) 14%)',
            ].join(','),
          }}
        />

        {/* ③ 交互层：物件热区 */}
        <Hotspot spot={HOTSPOTS.paper} onClick={() => onOpen('write')} debug={debugHotspots} />
        <Hotspot spot={HOTSPOTS.calendar} onClick={() => onOpen('calendar')} debug={debugHotspots} count={unreadCount} />

        {/* 弹窗与角落 UI 由外面传进来 */}
        {children}
      </div>
    </div>
  )
}

// 一个可点击的物件：平时完全隐形，鼠标移上去才浮起一层柔光
// （不弹文字提示：物件自己长什么样子就说明了自己是谁，字是多余的）
// debug 只给预览台用：把热区边框画出来，方便对坐标
function Hotspot({ spot, onClick, debug, count = 0 }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => { sfxTap(); onClick() }}
      className="absolute z-30 cursor-pointer rounded-2xl transition-all duration-300"
      style={{
        left: `${spot.left}%`, top: `${spot.top}%`,
        width: `${spot.width}%`, height: `${spot.height}%`,
        background: hover
          ? 'radial-gradient(ellipse at 50% 50%, rgba(247,242,238,0.32), rgba(216,180,182,0.08) 70%, rgba(255,255,255,0) 100%)'
          : 'transparent',
        boxShadow: hover ? '0 0 34px rgba(247,242,238,0.38) inset' : 'none',
        outline: debug ? '1.5px solid rgba(255,60,110,0.85)' : undefined,
      }}
      aria-label={count ? `${spot.label}，${count} 条未读内容` : spot.label}
    >
      {count > 0 && <span aria-hidden="true" className="absolute right-[12%] top-[12%] h-2.5 w-2.5 rounded-full bg-[#c48c92] ring-2 ring-[#f7f2ee]/85" />}
    </button>
  )
}

export default Scene
