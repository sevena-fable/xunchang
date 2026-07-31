// 预览台 —— 只在本地开发时用（打开 http://localhost:5173/preview.html）
// 它不连数据库、不需要登录，用假数据把画面和每个面板都摆出来，
// 方便一次看完四个时段、挑美术上的毛病。正式产品完全不受它影响。
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Scene from './components/Scene'
import BellPanel from './components/BellPanel'
import WriteLetter from './components/WriteLetter'
import ReadLetter from './components/ReadLetter'
import LettersPanel from './components/LettersPanel'
import CalendarPanel from './components/CalendarPanel'
import CupPanel from './components/CupPanel'
import SettingsPanel from './components/SettingsPanel'
import { setAmbience, setAmbienceVolume } from './lib/ambient'

// ——— 假数据 ———
const ME = '11111111-1111-1111-1111-111111111111'
const YOU = '22222222-2222-2222-2222-222222222222'
const pair = { id: 'preview-pair', user_a: ME, user_b: YOU, invite_code: 'YIYU01', status: 'paired' }
const profile = { id: ME, nickname: '小羽' }

function iso(daysAgo, hour = 10) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 24, 0, 0)
  return d.toISOString()
}

const LETTERS = [
  { id: 'l1', pair_id: pair.id, sender_id: YOU, stationery: 'cream', status: 'delivered', content: '今天路过那家花店，橱窗里摆的还是上次那一束。我站着看了一会儿，想起你说过你喜欢有点旧旧的颜色。', images: [], sealed_at: iso(0, 9), delivered_at: iso(0, 9) },
  { id: 'l2', pair_id: pair.id, sender_id: ME, stationery: 'kraft', status: 'read', content: '我把窗台收拾了一下，摆了一盆很小的绿色的东西。它好像不太需要人管，这点像我。', images: [], sealed_at: iso(2, 21), delivered_at: iso(2, 21), read_at: iso(2, 22) },
  { id: 'l3', pair_id: pair.id, sender_id: YOU, stationery: 'night', status: 'read', content: '半夜醒了，外面很安静。突然很想让你看看我这边的天。', images: [], sealed_at: iso(5, 2), delivered_at: iso(5, 2), read_at: iso(5, 8) },
  { id: 'l4', pair_id: pair.id, sender_id: ME, stationery: 'sky', status: 'sealed', content: '（这封还封在桌上，没寄出去）', images: [], sealed_at: iso(1, 15) },
]
const REACTIONS = {
  l2: { id: 'r1', letter_id: 'l2', emoji: 'heart', note: '这盆我认得，很像你' },
}

const TIMES = [
  { key: 'morning', label: '早晨' },
  { key: 'day', label: '白天' },
  { key: 'dusk', label: '黄昏' },
  { key: 'night', label: '夜晚' },
]

function Preview() {
  const [time, setTime] = useState('day')
  const [here, setHere] = useState(true)         // 鸽子在不在我窗台
  const [guarding, setGuarding] = useState(true) // 是否守着信
  const [panel, setPanel] = useState(null)
  const [reading, setReading] = useState(null)
  const [amb, setAmb] = useState('off')
  const [vol, setVol] = useState(0.22)
  const [boxes, setBoxes] = useState(false)     // 是否画出热区边框

  const pigeon = {
    id: 'preview-pigeon', pair_id: pair.id, name: '小灰',
    call_for_a: '小羽的主人', call_for_b: '',
    location: here ? 'a_window' : 'b_window',
    state: guarding ? 'guarding' : 'idle',
    last_stroll_at: new Date().toISOString(),
  }
  const unread = LETTERS.filter((l) => l.sender_id !== ME && l.status === 'delivered')
  const mySealed = LETTERS.filter((l) => l.sender_id === ME && l.status === 'sealed')
  const history = LETTERS.filter((l) => l.status !== 'sealed')

  function pickAmb(k) { setAmb(k); setAmbience(k) }
  function pickVol(v) { setVol(v); setAmbienceVolume(v) }

  return (
    <>
      <Scene
        pigeon={pigeon}
        atMyWindow={here}
        myCall="小羽的主人"
        unreadCount={unread.length}
        onOpen={setPanel}
        forceScene={time}
        debugHotspots={boxes}
      >

        <BellPanel open={panel === 'bell'} onClose={() => setPanel(null)} pair={pair} userId={ME} pigeon={pigeon} partnerOnline={false} onChanged={() => {}} />
        <WriteLetter open={panel === 'write'} onClose={() => setPanel(null)} pair={pair} userId={ME} pigeon={pigeon} onDone={() => setPanel(null)} />
        <LettersPanel open={panel === 'letters'} onClose={() => setPanel(null)} userId={ME} unread={unread} mySealed={mySealed} history={history} reactions={REACTIONS} pigeonName={pigeon.name} onRead={(l) => { setPanel(null); setReading(l) }} />
        <CalendarPanel open={panel === 'calendar'} onClose={() => setPanel(null)} history={history} userId={ME} onRead={(l) => { setPanel(null); setReading(l) }} />
        <CupPanel open={panel === 'cup'} onClose={() => setPanel(null)} ambience={amb} volume={vol} onPick={pickAmb} onVolume={pickVol} />
        <SettingsPanel open={panel === 'settings'} onClose={() => setPanel(null)} userId={ME} profile={profile} pair={pair} pigeon={pigeon} myCallField="call_for_a" partnerNickname="阿灰" onChanged={() => {}} />

        {reading && (
          <ReadLetter
            letter={reading}
            userId={ME}
            pair={pair}
            pigeon={pigeon}
            reaction={REACTIONS[reading.id]}
            onClose={() => setReading(null)}
            onChanged={() => {}}
          />
        )}
      </Scene>

      {/* 预览台的控制条：摆在画面外的黑边上（画面是 16:9，上下总有空余），不遮景 */}
      <div className="fixed bottom-2 left-1/2 z-[60] flex max-w-[96vw] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-stone-900/85 px-3 py-2 text-[11px] text-amber-50 shadow-xl backdrop-blur-sm">
        {TIMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTime(t.key)}
            className={`rounded-full px-2.5 py-1 tracking-widest transition-colors ${time === t.key ? 'bg-amber-100 text-stone-800' : 'hover:bg-white/15'}`}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 h-3 w-px bg-white/25" />
        <button onClick={() => setHere((v) => !v)} className="rounded-full px-2.5 py-1 tracking-widest hover:bg-white/15">
          鸽子{here ? '在' : '不在'}
        </button>
        <button onClick={() => setGuarding((v) => !v)} className="rounded-full px-2.5 py-1 tracking-widest hover:bg-white/15">
          {guarding ? '守信' : '空闲'}
        </button>
        <button
          onClick={() => setBoxes((v) => !v)}
          className={`rounded-full px-2.5 py-1 tracking-widest transition-colors ${boxes ? 'bg-rose-300 text-stone-800' : 'hover:bg-white/15'}`}
        >
          热区
        </button>
        <span className="mx-1 h-3 w-px bg-white/25" />
        {['bell', 'write', 'letters', 'calendar', 'cup', 'settings'].map((k) => (
          <button key={k} onClick={() => setPanel(k)} className="rounded-full px-2 py-1 hover:bg-white/15">{k}</button>
        ))}
        <button onClick={() => setReading(LETTERS[0])} className="rounded-full px-2 py-1 hover:bg-white/15">拆信</button>
      </div>
    </>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
