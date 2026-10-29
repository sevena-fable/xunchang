// 历史信鸽动画组件，当前 Scene 未引用。
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimation } from 'framer-motion'
import { PIGEON_PERCH } from '../lib/scene'
import { sfxWings, sfxCoo } from '../lib/sfx'

// 点击鸽子的随机小动作：动作 + 它可能说的话
const POKES = [
  { name: 'tilt', line: (n) => `${n} 歪着头看你` },
  { name: 'preen', line: () => '它低头理了理羽毛' },
  { name: 'coo', line: () => '咕…咕——' },
  { name: 'nuzzle', line: (n, call) => (call ? `它蹭了蹭你的手：「${call}」` : '它蹭了蹭你的手') },
  { name: 'hop', line: () => '它原地蹦了一下' },
  { name: 'flutter', line: () => '它抖了抖翅膀，羽毛落下来一根' },
]

function PigeonSprite({ pigeon, atMyWindow, myCall }) {
  const controls = useAnimation()
  const [bubble, setBubble] = useState('')
  const bubbleTimer = useRef(null)
  const busyRef = useRef(false)

  useEffect(() => () => clearTimeout(bubbleTimer.current), [])

  // 飞来时扇一下翅膀的声音
  useEffect(() => {
    if (atMyWindow) sfxWings()
  }, [atMyWindow])

  async function poke() {
    if (busyRef.current) return
    busyRef.current = true
    const act = POKES[Math.floor(Math.random() * POKES.length)]

    setBubble(act.line(pigeon.name, myCall))
    clearTimeout(bubbleTimer.current)
    bubbleTimer.current = setTimeout(() => setBubble(''), 2600)

    if (act.name === 'coo') sfxCoo()
    else if (act.name === 'flutter') sfxWings()

    // 每种小动作对应一段不同的身体语言
    if (act.name === 'tilt') {
      await controls.start({ rotate: [0, -9, 6, 0], transition: { duration: 1.1, ease: 'easeInOut' } })
    } else if (act.name === 'preen') {
      await controls.start({ rotate: [0, 14, 6, 12, 0], y: [0, 5, 2, 5, 0], transition: { duration: 1.3 } })
    } else if (act.name === 'coo') {
      await controls.start({ scaleY: [1, 1.07, 0.97, 1.04, 1], transition: { duration: 0.9 } })
    } else if (act.name === 'nuzzle') {
      await controls.start({ x: [0, -12, -6, -12, 0], rotate: [0, -6, -3, -6, 0], transition: { duration: 1.2 } })
    } else if (act.name === 'hop') {
      await controls.start({ y: [0, -26, 0, -8, 0], transition: { duration: 0.75, ease: 'easeOut' } })
    } else {
      await controls.start({ rotate: [0, -4, 4, -3, 0], scaleX: [1, 1.06, 0.98, 1.03, 1], transition: { duration: 0.8 } })
    }
    busyRef.current = false
  }

  return (
    <AnimatePresence>
      {atMyWindow && (
        <motion.div
          className="absolute z-20 select-none"
          style={{
            left: `${PIGEON_PERCH.left}%`,
            bottom: `${PIGEON_PERCH.bottom}%`,
            height: `${PIGEON_PERCH.height}%`,
          }}
          // 从窗外远处飞进来：又小又淡，落到窗沿上
          initial={{ opacity: 0, scale: 0.35, x: '38%', y: '-190%' }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0.3, x: '44%', y: '-210%' }}
          transition={{ duration: 1.5, ease: [0.22, 0.9, 0.24, 1] }}
        >
          {/* 它说的话 */}
          <AnimatePresence>
            {bubble && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                className="panel-toast absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap px-3.5 py-1.5"
              >
                {bubble}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 守信时不另外挂小信封了：支架上的信封立绘就是"有信"的提示，不用重复说两遍 */}

          <motion.img
            src="/pigeon.png"
            alt={pigeon.name}
            draggable="false"
            animate={controls}
            onClick={poke}
            title={`摸摸 ${pigeon.name}`}
            className="pigeon-bob h-full w-auto cursor-pointer origin-bottom"
            style={{ filter: 'drop-shadow(0 6px 10px rgba(60,40,20,0.28))' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default PigeonSprite
