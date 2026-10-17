import { useEffect, useRef, useState } from 'react'
import Scene from '../components/Scene'
import WriteLetter from '../components/WriteLetter'
import ReadLetter from '../components/ReadLetter'
import CalendarPanel from '../components/CalendarPanel'
import SettingsPanel from '../components/SettingsPanel'
import { useLetters } from '../hooks/useLetters'
import { sendLetter, markRead, deliverLetter, submitReaction, resolveLetterImages } from '../lib/letters'
import { supabase } from '../lib/supabase'
import { stopBgm, startBgm } from '../lib/bgm'
import { sfxArrive } from '../lib/sfx'
import Panel, { PrimaryButton, GhostButton } from '../components/Panel'

export default function HomePage({ userId, profile, pair, partnerNickname, onChanged }) {
  const { letters, unread, mySealed, history, reactions, error, loading, reactionLoading, reactionError, reload, reloadReactions } = useLetters({ pair, userId })
  const [panel, setPanel] = useState(null)
  const [readingId, setReadingId] = useState(null)
  const [askBgm, setAskBgm] = useState(true)
  const reading = letters.find((letter) => letter.id === readingId)
  const prevUnread = useRef(null)
  useEffect(() => stopBgm, [])
  useEffect(() => {
    if (prevUnread.current !== null && unread.length > prevUnread.current) sfxArrive()
    prevUnread.current = unread.length
  }, [unread.length])

  async function saveNickname(nickname) {
    const { data, error: cause } = await supabase.from('profiles').update({ nickname }).eq('id', userId).select('id').single()
    if (cause || !data) throw cause || new Error('昵称没有保存成功')
    await onChanged()
  }
  async function logout() {
    const { error: cause } = await supabase.auth.signOut()
    if (cause) throw cause
  }

  return (
    <Scene onOpen={setPanel} unreadCount={unread.length}>
      <div className="absolute right-4 top-4 z-30">
        <button aria-label="设置" onClick={() => setPanel('settings')} className="rounded-full px-2 py-1 text-[#f7f2ee]/85 hover:text-[#f7f2ee]" style={{ filter: 'drop-shadow(0 1px 6px #4a4358b3)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="6.4" /><circle cx="12" cy="12" r="2.4" />
            <path strokeWidth="3" d="M17.8 12H20M16.1 16.1l1.56 1.56M12 17.8V20M7.9 16.1l-1.56 1.56M6.2 12H4M7.9 7.9 6.34 6.34M12 6.2V4M16.1 7.9l1.56-1.56" />
          </svg>
        </button>
      </div>
      {(error || loading) && <div role="status" className="panel-toast absolute left-4 top-4 z-30 px-3 py-2">{error || '正在读取内容…'}{error && <button onClick={reload} className="ml-3 underline">重试</button>}</div>}
      <WriteLetter open={panel === 'write'} onClose={() => setPanel(null)} pair={pair} userId={userId} onSend={sendLetter} onDone={reload} />
      <CalendarPanel open={panel === 'calendar'} onClose={() => setPanel(null)} history={history} unread={unread} mySealed={mySealed} userId={userId} onRead={(letter) => { setPanel(null); setReadingId(letter.id) }} />
      <SettingsPanel open={panel === 'settings'} onClose={() => setPanel(null)} profile={profile} pair={pair} partnerNickname={partnerNickname} onSave={saveNickname} onLogout={logout} />
      {reading && <ReadLetter key={reading.id} letter={reading} userId={userId} reaction={reactions[reading.id]} reactionLoading={reactionLoading} reactionError={reactionError} onRetryReactions={reloadReactions} onClose={() => setReadingId(null)} onChanged={reload} onMarkRead={markRead} onDeliver={deliverLetter} onReact={submitReaction} resolveImages={resolveLetterImages} />}
      <Panel open={askBgm} title="背景音乐" subtitle="要播放音乐吗？之后可以在设置里随时开关。" onClose={() => setAskBgm(false)} width="max-w-sm">
        <div className="panel-actions">
          <GhostButton onClick={() => setAskBgm(false)}>先不听</GhostButton>
          <PrimaryButton onClick={() => { startBgm(); setAskBgm(false) }}>播放</PrimaryButton>
        </div>
      </Panel>
    </Scene>
  )
}
