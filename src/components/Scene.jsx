// 窗台场景 —— 全屏的那扇窗（阶段四）
// 分层结构（从下到上）：
//   ① 世界层：背景图 + 云 + 鸽子 —— 整层套用四时色调滤镜，所以鸽子也会被夜色染上
//   ② 色调层：晨雾 / 晚霞 / 夜色（不接受点击）
//   ③ 光层：台灯的光、桌面光斑的呼吸、夜晚的星与月
//   ④ 交互层：物件热区、角落 UI、弹窗
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { SCENES, HOTSPOTS, SKY_AREA, VILLAGE_LIGHTS, currentScene } from '../lib/scene'
import PigeonSprite from './PigeonSprite'
import { sfxTap } from '../lib/sfx'

const FRAME_RATIO = 1672 / 941

// 天空里飘的几朵柔云：位置/大小/速度都错开，看起来才不像复制粘贴
const CLOUDS = [
  { top: 6, size: 30, dur: 150, delay: 0 },
  { top: 22, size: 20, dur: 110, delay: 28 },
  { top: 13, size: 40, dur: 210, delay: 65 },
  { top: 33, size: 15, dur: 95, delay: 12 },
]

// 夜空的星星（固定位置，避免每次渲染乱跳）
const STARS = [
  [24, 8], [31, 15], [38, 6], [45, 19], [52, 10], [58, 22], [64, 7],
  [28, 26], [42, 30], [50, 34], [61, 31], [35, 21], [69, 16], [22, 18],
  [47, 5], [55, 27], [67, 25], [30, 35], [40, 12], [63, 38],
]

function Scene({ pigeon, atMyWindow, myCall, unreadCount, onOpen, forceScene, debugHotspots, children }) {
  // 现实时间决定画面（规则 6.2）；每分钟核对一次，跨过时段边界会自动换
  // forceScene 只给预览台用：强制看某个时段，不必等到天黑
  const [sceneKey, setSceneKey] = useState(() => forceScene || currentScene())
  useEffect(() => {
    if (forceScene) { setSceneKey(forceScene); return }
    setSceneKey(currentScene())
    const t = setInterval(() => setSceneKey(currentScene()), 60_000)
    return () => clearInterval(t)
  }, [forceScene])
  const scene = SCENES[sceneKey]

  // 画面尺寸：始终保持 16:9 完整可见（用"取小值"让它在任何屏幕上都不裁切、不变形）
  const frameStyle = useMemo(() => ({
    width: `min(100vw, calc(100vh * ${FRAME_RATIO}))`,
    height: `min(100vh, calc(100vw / ${FRAME_RATIO}))`,
  }), [])

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#15110d]">
      <div className="relative overflow-hidden shadow-[0_0_120px_rgba(0,0,0,0.6)]" style={frameStyle}>

        {/* ① 世界层：背景 + 云 + 鸽子（整层被四时滤镜染色） */}
        <div className="absolute inset-0" style={{ filter: scene.filter || 'none', transition: 'filter 1.6s ease' }}>
          <img
            src={scene.image}
            alt="窗台"
            draggable="false"
            className="absolute inset-0 h-full w-full select-none object-fill"
          />

          {/* 窗外缓缓飘过的云 */}
          <div
            className="absolute overflow-hidden"
            style={{ left: `${SKY_AREA.left}%`, top: `${SKY_AREA.top}%`, width: `${SKY_AREA.width}%`, height: `${SKY_AREA.height}%` }}
          >
            {CLOUDS.map((c, i) => (
              <div
                key={i}
                className="cloud-drift"
                style={{
                  top: `${c.top}%`,
                  left: 0,
                  width: `${c.size}%`,
                  height: `${c.size * 0.42}%`,
                  animationDuration: `${c.dur}s`,
                  animationDelay: `-${c.delay}s`,
                  opacity: sceneKey === 'night' ? 0.25 : 0.85,
                }}
              />
            ))}
          </div>

          {/* 鸽子（在我窗台才出现） */}
          <PigeonSprite pigeon={pigeon} atMyWindow={atMyWindow} myCall={myCall} />
        </div>

        {/* ② 色调层：晨雾 / 晚霞 / 夜色 */}
        <AnimatePresence>
          {scene.overlay && (
            <motion.div
              key={sceneKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6 }}
              className="pointer-events-none absolute inset-0"
              style={{ background: scene.overlay, mixBlendMode: scene.overlayBlend || 'normal' }}
            />
          )}
        </AnimatePresence>

        {/* ③ 光层 */}
        {/* 夜晚的星星、月亮与窗外小镇的灯火 */}
        {sceneKey === 'night' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2.2 }}
            className="pointer-events-none absolute inset-0"
          >
            {STARS.map(([x, y], i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  left: `${x}%`, top: `${y}%`,
                  width: i % 4 === 0 ? 2.5 : 1.7, height: i % 4 === 0 ? 2.5 : 1.7,
                  opacity: 0.85,
                  boxShadow: '0 0 6px rgba(255,255,255,0.9)',
                  animation: `twinkle ${2.4 + (i % 5) * 0.7}s ease-in-out ${i * 0.31}s infinite`,
                }}
              />
            ))}
            {/* 月亮 */}
            <div
              className="absolute rounded-full"
              style={{
                left: '30%', top: '9%', width: '3.4%', aspectRatio: '1',
                background: 'radial-gradient(circle at 38% 34%, #fffdf2 0%, #f4ead0 62%, #e8dcbc 100%)',
                boxShadow: '0 0 42px 14px rgba(255,248,214,0.34)',
              }}
            />
            {/* 远处小镇的灯火：每一盏都是别人家的窗口 */}
            {VILLAGE_LIGHTS.map(([x, y], i) => (
              <span
                key={`v${i}`}
                className="absolute rounded-full"
                style={{
                  left: `${x}%`, top: `${y}%`,
                  width: i % 3 === 0 ? 2.6 : 1.9, height: i % 3 === 0 ? 2.6 : 1.9,
                  background: i % 2 ? '#ffd79a' : '#ffe7bb',
                  boxShadow: `0 0 ${i % 3 === 0 ? 9 : 6}px ${i % 3 === 0 ? 3 : 2}px rgba(255,199,120,0.55)`,
                  opacity: 0.9,
                  animation: `twinkle ${5 + (i % 4) * 1.6}s ease-in-out ${i * 0.52}s infinite`,
                }}
              />
            ))}
            {/* 从窗口斜进来的一道月光（只要一点点，多了就成难了） */}
            <div
              className="absolute"
              style={{
                left: '22%', top: '12%', width: '52%', height: '72%',
                background: 'linear-gradient(196deg, rgba(176,206,255,0.12) 0%, rgba(150,186,246,0.04) 30%, rgba(150,186,246,0) 56%)',
                mixBlendMode: 'screen',
                filter: 'blur(12px)',
              }}
            />
          </motion.div>
        )}

        {/* 台灯：白天灭、夜里亮（规则 6.3，这是场景的时间语言，不是开关） */}
        <AnimatePresence>
          {scene.lampOn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
              className="pointer-events-none absolute inset-0"
            >
              {/* 灯罩自身的暖光 */}
              <div
                className="absolute rounded-full"
                style={{
                  left: '3%', top: '38%', width: '15%', height: '17%',
                  background: 'radial-gradient(closest-side, rgba(255,222,150,0.92), rgba(255,205,120,0.34) 58%, rgba(255,200,110,0) 100%)',
                  mixBlendMode: 'screen',
                  filter: 'blur(3px)',
                }}
              />
              {/* 洒到桌面上的一片光：紧贴着灯罩，要有焦点，不能泛成一层雾 */}
              <div
                className="absolute"
                style={{
                  left: '-6%', top: '46%', width: '54%', height: '52%',
                  background: 'radial-gradient(ellipse at 20% 24%, rgba(255,214,138,0.5), rgba(255,198,112,0.16) 44%, rgba(255,190,100,0) 76%)',
                  mixBlendMode: 'screen',
                  filter: 'blur(6px)',
                }}
              />
              {/* 信封与信纸那一小块单独给一团光，夜里也能认出来 */}
              <div
                className="absolute"
                style={{
                  left: '32%', top: '58%', width: '34%', height: '38%',
                  background: 'radial-gradient(ellipse at 50% 42%, rgba(255,210,140,0.24), rgba(255,198,120,0) 68%)',
                  mixBlendMode: 'screen',
                  filter: 'blur(8px)',
                }}
              />
              {/* 台历与茶杯那一侧的余光，不致于右半边黑成一块 */}
              <div
                className="absolute"
                style={{
                  left: '62%', top: '58%', width: '34%', height: '40%',
                  background: 'radial-gradient(ellipse at 40% 40%, rgba(255,206,138,0.17), rgba(255,196,120,0) 70%)',
                  mixBlendMode: 'screen',
                  filter: 'blur(10px)',
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 桌面光斑的呼吸，像阳光穿过树叶（夜里不需要） */}
        {sceneKey !== 'night' && (
          <div
            className="light-breathe pointer-events-none absolute"
            style={{
              left: '18%', top: '62%', width: '64%', height: '38%',
              background: `radial-gradient(ellipse at 50% 20%, ${scene.glow}, rgba(255,255,255,0) 72%)`,
              mixBlendMode: 'soft-light',
            }}
          />
        )}

        {/* 画面四周压一点暗角，视线自然聚到窗外；上下各拿一道极淡的渐变，让角落的字总能看清 */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              'radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 52%, rgba(20,12,4,0.28) 100%)',
              'linear-gradient(180deg, rgba(18,12,6,0.26) 0%, rgba(18,12,6,0.06) 9%, rgba(0,0,0,0) 16%)',
              'linear-gradient(0deg, rgba(18,12,6,0.34) 0%, rgba(18,12,6,0.1) 8%, rgba(0,0,0,0) 15%)',
            ].join(','),
          }}
        />

        {/* ④ 交互层：物件热区 */}
        <Hotspot spot={HOTSPOTS.bell} onClick={() => onOpen('bell')} debug={debugHotspots} />
        <Hotspot spot={HOTSPOTS.paper} onClick={() => onOpen('write')} debug={debugHotspots} />
        <Hotspot spot={HOTSPOTS.envelope} onClick={() => onOpen('letters')} badge={unreadCount} debug={debugHotspots} />
        <Hotspot spot={HOTSPOTS.calendar} onClick={() => onOpen('calendar')} debug={debugHotspots} />
        <Hotspot spot={HOTSPOTS.cup} onClick={() => onOpen('cup')} debug={debugHotspots} />
        <Hotspot spot={HOTSPOTS.lamp} onClick={() => onOpen('lamp')} debug={debugHotspots} />
        <Hotspot spot={HOTSPOTS.books} onClick={() => onOpen('books')} debug={debugHotspots} />

        {/* 时段小诗，画面底部一行淡淡的字 */}
        <AnimatePresence mode="wait">
          <motion.p
            key={sceneKey}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.72, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.4 }}
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] tracking-[0.3em] text-white"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,0.65)' }}
          >
            {scene.poem}
          </motion.p>
        </AnimatePresence>

        {/* 弹窗与角落 UI 由外面传进来 */}
        {children}
      </div>
    </div>
  )
}

// 一个可点击的物件：平时完全隐形，鼠标移上去才浮起柔光和名字
// debug 只给预览台用：把热区边框画出来，方便对坐标
function Hotspot({ spot, onClick, badge, debug }) {
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
          ? 'radial-gradient(ellipse at 50% 50%, rgba(255,236,180,0.3), rgba(255,225,150,0.06) 70%, rgba(255,255,255,0) 100%)'
          : 'transparent',
        boxShadow: hover ? '0 0 34px rgba(255,225,160,0.35) inset' : 'none',
        outline: debug ? '1.5px solid rgba(255,60,110,0.85)' : 'none',
      }}
      aria-label={spot.label}
    >
      {/* 未读信数量：不用手机式的红点，用一颗火漆色的小封蜡 */}
      {badge > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium text-amber-50"
          style={{
            background: 'radial-gradient(circle at 34% 30%, #d9764f, #a8402c 76%)',
            boxShadow: '0 1px 6px rgba(60,20,10,0.45), 0 0 0 1.5px rgba(255,244,225,0.75)',
            animation: 'badge-pulse 2.4s ease-in-out infinite',
          }}
        >
          {badge}
        </motion.span>
      )}

      <AnimatePresence>
        {hover && (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.22 }}
            className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-900/70 px-3 py-1 text-[11px] tracking-wider text-amber-50 backdrop-blur-sm"
          >
            {spot.label} · {spot.hint}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

export default Scene
