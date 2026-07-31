// 窗台首页 —— 从这里开始，页面就是那扇窗本身
// 这个文件只做三件事：① 把数据准备好 ② 渲染场景 ③ 决定此刻打开哪个面板
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Scene from '../components/Scene'
import BellPanel from '../components/BellPanel'
import WriteLetter from '../components/WriteLetter'
import ReadLetter from '../components/ReadLetter'
import LettersPanel from '../components/LettersPanel'
import CalendarPanel from '../components/CalendarPanel'
import CupPanel from '../components/CupPanel'
import SettingsPanel from '../components/SettingsPanel'
import SummonListener from '../components/SummonListener'
import { useLetters } from '../hooks/useLetters'
import { setAmbience, setAmbienceVolume } from '../lib/ambient'
import { sfxArrive, sfxTap } from '../lib/sfx'
import { HOTSPOTS } from '../lib/scene'

function HomePage({ userId, profile, pair, pigeon, partnerNickname, partnerOnline, onChanged }) {
  // 我是 user_a 还是 user_b？决定了"我的窗台"是哪一侧、鸽子对我的称呼存在哪个字段
  const myRole = pair.user_a === userId ? 'a' : 'b'
  const myCallField = myRole === 'a' ? 'call_for_a' : 'call_for_b'
  const myCall = pigeon[myCallField]
  const myWindow = myRole === 'a' ? 'a_window' : 'b_window'
  const atMyWindow = pigeon.location === myWindow

  // 桌上所有的信（含实时同步与鸽子溜达结算）
  const { unread, mySealed, history, reactions, reload } = useLetters({
    pair, userId, pigeon, onPigeonChanged: onChanged,
  })

  const [panel, setPanel] = useState(null)      // 当前打开的面板
  const [reading, setReading] = useState(null)  // 正在读的那封信
  const [whisper, setWhisper] = useState('')    // 画面下方一句一闪而过的话
  const [ambience, setAmb] = useState('off')
  const [volume, setVolume] = useState(0.22)

  // 环境音：选了就放，关了就静
  useEffect(() => { setAmbience(ambience) }, [ambience])
  useEffect(() => { setAmbienceVolume(volume) }, [volume])
  // 离开这个页面时把声音收掉，别在后台一直响
  useEffect(() => () => setAmbience('off'), [])

  // 一句悄悄话，几秒后自己消失
  const whisperTimer = useRef(null)
  function say(text) {
    setWhisper(text)
    clearTimeout(whisperTimer.current)
    whisperTimer.current = setTimeout(() => setWhisper(''), 3600)
  }
  useEffect(() => () => clearTimeout(whisperTimer.current), [])

  // 桌上悄悄多了一封信：轻轻提一句（第一次加载不提）
  const prevUnread = useRef(null)
  useEffect(() => {
    if (prevUnread.current !== null && unread.length > prevUnread.current) {
      sfxArrive()
      say('桌上多了一封信')
    }
    prevUnread.current = unread.length
  }, [unread.length])

  // 点物件：铃铛/信纸/信封/台历/茶杯有面板，台灯和书只是说一句话
  function open(key) {
    if (key === 'lamp' || key === 'books') {
      say(HOTSPOTS[key].hint)
      return
    }
    setPanel(key)
  }

  function openLetter(letter) {
    setPanel(null)
    setReading(letter)
  }

  return (
    <Scene
      pigeon={pigeon}
      atMyWindow={atMyWindow}
      myCall={myCall}
      unreadCount={unread.length}
      onOpen={open}
    >
      {/* 左上角：鸽子此刻在哪（位置本身就是全部提示，不显示对方在不在线） */}
      <div className="pointer-events-none absolute left-5 top-4 z-30 select-none">
        <p className="text-sm tracking-[0.3em] text-white/90" style={{ textShadow: '0 1px 10px rgba(0,0,0,0.7)' }}>
          {pigeon.name}
        </p>
        <p className="mt-0.5 text-[11px] tracking-wider text-white/65" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.7)' }}>
          {atMyWindow
            ? (pigeon.state === 'guarding' ? '在你窗前，守着一封信' : '就在你的窗沿上')
            : '此刻不在你的窗台'}
          {myCall ? ` · 它叫你「${myCall}」` : ''}
        </p>
      </div>

      {/* 右上角：茶杯的声音 + 设置 */}
      <div className="absolute right-4 top-4 z-30 flex items-center gap-1">
        {ambience !== 'off' && (
          <button
            onClick={() => { sfxTap(); setAmb('off') }}
            className="rounded-full px-2 py-1 text-white/70 transition-colors hover:text-white"
            style={{ filter: 'drop-shadow(0 1px 6px rgba(0,0,0,0.6))' }}
            title="安静一下"
          >
            {/* 一个小喇叭加一个叉：点了就把环境音关掉。
                不用 🔈 emoji，因为它是彩色的，和旁边同样白细线的齿轮放一起很打架 */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9.4h3.4L12 5.4v13.2L7.4 14.6H4z" />
              <path d="M16.4 9.8l4.2 4.4M20.6 9.8l-4.2 4.4" />
            </svg>
          </button>
        )}
        <button
          onClick={() => { sfxTap(); setPanel('settings') }}
          className="rounded-full px-2 py-1 text-white/70 transition-colors hover:text-white"
          style={{ filter: 'drop-shadow(0 1px 6px rgba(0,0,0,0.6))' }}
          title="设置"
        >
          {/* 手画的齿轮。原来这里是 ⚙ 字符，但它的粗细跟着系统字体走，
              换台电脑就和旁边的小喇叭不是一套笔画了。
              八个齿单独用了更粗的笔，不然细长的八根线会看成太阳的光芒 */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="6.4" />
            <circle cx="12" cy="12" r="2.4" />
            <path strokeWidth="3" d="M17.8 12H20M16.1 16.1l1.56 1.56M12 17.8V20M7.9 16.1l-1.56 1.56M6.2 12H4M7.9 7.9 6.34 6.34M12 6.2V4M16.1 7.9l1.56-1.56" />
          </svg>
        </button>
      </div>

      {/* 还没告诉鸽子怎么称呼你：温柔地提一次 */}
      {!myCall && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.4, duration: 1 }}
          onClick={() => { sfxTap(); setPanel('settings') }}
          className="absolute bottom-9 left-1/2 z-30 -translate-x-1/2 rounded-full bg-stone-900/45 px-4 py-1.5 text-[11px] tracking-widest text-amber-50 backdrop-blur-sm transition-colors hover:bg-stone-900/65"
        >
          {pigeon.name} 还不知道该怎么称呼你 · 点这里告诉它
        </motion.button>
      )}

      {/* 一句悄悄话 */}
      <AnimatePresence>
        {whisper && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="pointer-events-none absolute bottom-16 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-900/55 px-4 py-1.5 text-xs tracking-widest text-amber-50 backdrop-blur-sm"
          >
            {whisper}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ——— 各个物件的面板 ——— */}
      <BellPanel
        open={panel === 'bell'}
        onClose={() => setPanel(null)}
        pair={pair} userId={userId} pigeon={pigeon}
        partnerOnline={partnerOnline}
        onChanged={onChanged}
      />

      <WriteLetter
        open={panel === 'write'}
        onClose={() => setPanel(null)}
        pair={pair} userId={userId} pigeon={pigeon}
        onDone={() => { setPanel(null); reload(); onChanged() }}
      />

      <LettersPanel
        open={panel === 'letters'}
        onClose={() => setPanel(null)}
        userId={userId}
        unread={unread} mySealed={mySealed} history={history}
        reactions={reactions}
        pigeonName={pigeon.name}
        onRead={openLetter}
      />

      <CalendarPanel
        open={panel === 'calendar'}
        onClose={() => setPanel(null)}
        history={history}
        userId={userId}
        onRead={openLetter}
      />

      <CupPanel
        open={panel === 'cup'}
        onClose={() => setPanel(null)}
        ambience={ambience}
        volume={volume}
        onPick={setAmb}
        onVolume={setVolume}
      />

      <SettingsPanel
        open={panel === 'settings'}
        onClose={() => setPanel(null)}
        userId={userId} profile={profile} pair={pair} pigeon={pigeon}
        myCallField={myCallField}
        partnerNickname={partnerNickname}
        onChanged={onChanged}
      />

      {/* 读一封信（自带拆信仪式） */}
      {reading && (
        <ReadLetter
          letter={reading}
          userId={userId}
          pair={pair}
          pigeon={pigeon}
          reaction={reactions[reading.id]}
          onClose={() => setReading(null)}
          onChanged={() => { reload(); onChanged() }}
        />
      )}

      {/* 对方摇铃想召回鸽子时，这里弹出让你决定 */}
      <SummonListener
        pair={pair}
        userId={userId}
        pigeon={pigeon}
        partnerNickname={partnerNickname}
        onChanged={onChanged}
      />
    </Scene>
  )
}

export default HomePage
