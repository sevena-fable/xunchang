import { StrictMode, useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import Scene from './components/Scene'
import WriteLetter from './components/WriteLetter'
import ReadLetter from './components/ReadLetter'
import CalendarPanel from './components/CalendarPanel'
import SettingsPanel from './components/SettingsPanel'

const ME = '11111111-1111-1111-1111-111111111111'
const YOU = '22222222-2222-2222-2222-222222222222'
const pair = { id: 'preview-pair', user_a: ME, user_b: YOU, invite_code: 'XUNCHANG', status: 'paired' }
function iso(daysAgo) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}
const INITIAL = [
  { id: 'l1', pair_id: pair.id, sender_id: YOU, stationery: 'cream', status: 'delivered', content: '今天路过那家花店，橱窗里摆的还是上次那一束。我站着看了一会儿，想起你说过你喜欢有点旧旧的颜色。', images: [], sealed_at: iso(0), delivered_at: iso(0) },
  { id: 'l2', pair_id: pair.id, sender_id: ME, stationery: 'kraft', status: 'read', content: '我把窗台收拾了一下，摆了一盆很小的绿色的东西。它好像不太需要人管，这点像我。', images: [], sealed_at: iso(2), delivered_at: iso(2) },
  { id: 'l3', pair_id: pair.id, sender_id: YOU, stationery: 'night', status: 'delivered', content: '半夜醒了，外面很安静。突然很想让你看看我这边的天。', images: [], sealed_at: iso(40), delivered_at: iso(40) },
  { id: 'l4', pair_id: pair.id, sender_id: ME, stationery: 'cream', status: 'sealed', content: '这段摘录还没分享，先放在这里。', images: [], sealed_at: iso(4) },
]
const resolveImages = async (images) => images.map((file) => URL.createObjectURL(file))
const noop = () => {}

function Preview() {
  const [panel, setPanel] = useState(null)
  const [readingId, setReadingId] = useState(null)
  const [boxes, setBoxes] = useState(false)
  const [letters, setLetters] = useState(INITIAL)
  const [profile, setProfile] = useState({ id: ME, nickname: '小羽' })
  const [reactions, setReactions] = useState({ l2: { emoji: 'heart', note: '这盆我认得，很像你' } })
  const sent = useRef(new Map())
  const reading = letters.find((letter) => letter.id === readingId)
  const unread = letters.filter((letter) => letter.sender_id !== ME && letter.status === 'delivered')
  const mySealed = letters.filter((letter) => letter.sender_id === ME && letter.status === 'sealed')

  const send = useCallback(async (draft) => {
    if (sent.current.has(draft.id)) return sent.current.get(draft.id)
    const now = new Date().toISOString()
    const letter = { id: draft.id, pair_id: pair.id, sender_id: ME, content: draft.content, annotations: draft.annotations, images: draft.attachments.map((item) => item.file), stationery: 'cream', status: 'delivered', sealed_at: now, delivered_at: now }
    sent.current.set(draft.id, letter)
    setLetters((items) => [letter, ...items])
    return letter
  }, [])
  const markRead = useCallback(async (letter) => {
    setLetters((items) => items.map((item) => item.id === letter.id ? { ...item, status: 'read', read_at: new Date().toISOString() } : item))
  }, [])
  const deliver = useCallback(async (letter) => {
    setLetters((items) => items.map((item) => item.id === letter.id ? { ...item, status: 'delivered', delivered_at: new Date().toISOString() } : item))
  }, [])
  const react = useCallback(async (value) => {
    setReactions((items) => ({ ...items, [value.letterId]: value }))
  }, [])

  return (
    <>
      <Scene onOpen={setPanel} debugHotspots={boxes} unreadCount={unread.length}>
        <WriteLetter environment="preview" open={panel === 'write'} onClose={() => setPanel(null)} pair={pair} userId={ME} onSend={send} onDone={noop} />
        <CalendarPanel open={panel === 'calendar'} onClose={() => setPanel(null)} history={letters.filter((letter) => ['delivered', 'read'].includes(letter.status))} unread={unread} mySealed={mySealed} userId={ME} onRead={(letter) => { setPanel(null); setReadingId(letter.id) }} />
        <SettingsPanel open={panel === 'settings'} onClose={() => setPanel(null)} profile={profile} pair={pair} partnerNickname="阿灰" onSave={async (nickname) => setProfile({ id: ME, nickname })} onLogout={async () => setPanel(null)} />
        {reading && <ReadLetter key={reading.id} letter={reading} userId={ME} reaction={reactions[reading.id]} onClose={() => setReadingId(null)} onChanged={noop} onMarkRead={markRead} onDeliver={deliver} onReact={react} resolveImages={resolveImages} />}
      </Scene>
        <nav aria-label="预览工具" className="fixed bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-xl bg-[#857c91]/90 px-4 py-2 text-xs text-[#f7f2ee]">
          <button onClick={() => setBoxes((value) => !value)}>热区</button>
          <button onClick={() => setPanel('write')}>分享</button>
          <button onClick={() => setPanel('calendar')}>台历</button>
          <button onClick={() => setPanel('settings')}>设置</button>
          <button onClick={() => setReadingId('l1')}>查看内容</button>
          <span className="ml-2 opacity-60">本地演示</span>
        </nav>
    </>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><MotionConfig reducedMotion="user"><Preview /></MotionConfig></StrictMode>)
