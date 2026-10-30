import { StrictMode, useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import Scene from './components/Scene'
import WriteLetter from './components/WriteLetter'
import ReadLetter from './components/ReadLetter'
import CalendarPanel from './components/CalendarPanel'
import SettingsPanel from './components/SettingsPanel'
import { sameReply, validateReply } from './lib/annotationReplies'

const ME = '11111111-1111-1111-1111-111111111111'
const YOU = '22222222-2222-2222-2222-222222222222'
const pair = { id: 'preview-pair', user_a: ME, user_b: YOU, invite_code: 'XUNCHANG', status: 'paired' }
function iso(daysAgo) {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}
const INITIAL = [
  { id: 'l1', pair_id: pair.id, sender_id: YOU, stationery: 'cream', status: 'delivered', content: '采菊东篱下，悠然见南山。\n\n出处：陶渊明《饮酒·其五》', annotations: [{ id: '33333333-3333-4333-8333-333333333333', start: 6, end: 11, quote: '悠然见南山', note: '读到这里，想把阅读的速度也放慢一点。' }], images: [], sealed_at: iso(0), delivered_at: iso(0) },
  { id: 'l2', pair_id: pair.id, sender_id: ME, stationery: 'kraft', status: 'read', content: '行到水穷处，坐看云起时。\n\n出处：王维《终南别业》', images: [], sealed_at: iso(2), delivered_at: iso(2) },
  { id: 'l3', pair_id: pair.id, sender_id: YOU, stationery: 'night', status: 'delivered', content: '小楼一夜听春雨，深巷明朝卖杏花。\n\n出处：陆游《临安春雨初霁》', images: [], sealed_at: iso(40), delivered_at: iso(40) },
  { id: 'l4', pair_id: pair.id, sender_id: ME, stationery: 'cream', status: 'sealed', content: '这段摘录还没分享，先放在这里。', images: [], sealed_at: iso(4) },
]
const REPLY_STORAGE = 'xunchang-preview-annotation-replies-v1'
const DEMO_REPLIES = [{ id: '44444444-4444-4444-8444-444444444444', letter_id: 'l1', pair_id: pair.id, user_id: ME, start: 8, end: 12, quote: '见南山。', note: '我也喜欢这份从容，像在忙碌里留了一点空白。', created_at: iso(0) }]
function loadReplies() {
  try { return JSON.parse(localStorage.getItem(REPLY_STORAGE) || 'null') || DEMO_REPLIES } catch { return DEMO_REPLIES }
}
const resolveImages = async (images) => images.map((file) => URL.createObjectURL(file))
const noop = () => {}

function Preview() {
  const [panel, setPanel] = useState(null)
  const [viewerId, setViewerId] = useState(ME)
  const [replies, setReplies] = useState(loadReplies)
  const replyRecords = useRef(replies)
  replyRecords.current = replies
  useEffect(() => {
    const changed = (event) => { if (event.key === REPLY_STORAGE) setReplies(loadReplies()) }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  const [readingId, setReadingId] = useState(null)
  const [boxes, setBoxes] = useState(false)
  const [letters, setLetters] = useState(INITIAL)
  const [profile, setProfile] = useState({ id: ME, nickname: '小羽' })
  const [reactions, setReactions] = useState({ l2: { emoji: 'heart', note: '这句读起来很安静' } })
  const sent = useRef(new Map())
  const reading = letters.find((letter) => letter.id === readingId)
  const unread = letters.filter((letter) => letter.sender_id !== viewerId && letter.status === 'delivered')
  const mySealed = letters.filter((letter) => letter.sender_id === viewerId && letter.status === 'sealed')

  const send = useCallback(async (draft) => {
    if (sent.current.has(draft.id)) return sent.current.get(draft.id)
    const now = new Date().toISOString()
    const letter = { id: draft.id, pair_id: pair.id, sender_id: draft.userId, content: draft.content, annotations: draft.annotations, images: draft.attachments.map((item) => item.file), stationery: 'cream', status: 'delivered', sealed_at: now, delivered_at: now }
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

  async function replyToText(input) {
    validateReply(reading.content, input)
    const record = { id: input.id, letter_id: reading.id, pair_id: pair.id, user_id: viewerId, start: input.start, end: input.end, quote: input.quote, note: input.note }
    if (reading.sender_id === viewerId) throw Object.assign(new Error('只能回复对方分享的文字'), { confirmedNotSent: true })
    const existing = replyRecords.current.find((item) => item.id === record.id)
    if (existing) {
      if (sameReply(existing, record)) return existing
      throw Object.assign(new Error('这次回复已有不同内容，请先核对'), { confirmedNotSent: true })
    }
    if (replyRecords.current.some((item) => item.letter_id === record.letter_id && item.user_id === viewerId && item.start === record.start && item.end === record.end)) throw Object.assign(new Error('这段文字已经有你的回复'), { confirmedNotSent: true })
    const saved = { ...record, created_at: new Date().toISOString() }
    const next = [...replyRecords.current, saved]
    try { localStorage.setItem(REPLY_STORAGE, JSON.stringify(next)) }
    catch { throw Object.assign(new Error('本地回复没有保存，请重试'), { confirmedNotSent: true }) }
    replyRecords.current = next
    setReplies(next)
    return saved
  }

  return (
    <>
      <Scene onOpen={setPanel} debugHotspots={boxes} unreadCount={unread.length}>
        <WriteLetter environment="preview" open={panel === 'write'} onClose={() => setPanel(null)} pair={pair} userId={viewerId} onSend={send} onDone={noop} />
        <CalendarPanel open={panel === 'calendar'} onClose={() => setPanel(null)} history={letters.filter((letter) => ['delivered', 'read'].includes(letter.status))} unread={unread} mySealed={mySealed} userId={viewerId} onRead={(letter) => { setPanel(null); setReadingId(letter.id) }} />
        <SettingsPanel open={panel === 'settings'} onClose={() => setPanel(null)} profile={profile} pair={pair} partnerNickname="阿灰" onSave={async (nickname) => setProfile({ id: ME, nickname })} onLogout={async () => setPanel(null)} />
        {reading && <ReadLetter key={`${reading.id}:${viewerId}`} letter={reading} userId={viewerId} replies={replies.filter((reply) => reply.letter_id === reading.id)} onReply={replyToText} reaction={reactions[reading.id]} onClose={() => setReadingId(null)} onChanged={noop} onMarkRead={markRead} onDeliver={deliver} onReact={react} resolveImages={resolveImages} />}
      </Scene>
        <nav aria-label="预览工具" className="fixed bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-xl bg-[#857c91]/90 px-4 py-2 text-xs text-[#f7f2ee]">
          <button onClick={() => setBoxes((value) => !value)}>热区</button>
          <button onClick={() => setPanel('write')}>分享</button>
          <button onClick={() => setPanel('calendar')}>台历</button>
          <button onClick={() => setPanel('settings')}>设置</button>
          <button onClick={() => setReadingId('l1')}>查看内容</button>
          <button onClick={() => setViewerId((value) => value === ME ? YOU : ME)}>{viewerId === ME ? '切换为分享者' : '切换为阅读者'}</button>
          <span className="ml-2 opacity-60">本地演示</span>
        </nav>
    </>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><MotionConfig reducedMotion="user"><Preview /></MotionConfig></StrictMode>)
