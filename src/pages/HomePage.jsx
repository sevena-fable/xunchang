import { useEffect, useRef, useState } from 'react'
import CabinExperience from '../components/cabin/CabinExperience'
import WriteLetter from '../components/WriteLetter'
import ReadLetter from '../components/ReadLetter'
import CalendarPanel from '../components/CalendarPanel'
import MailboxPanel from '../components/MailboxPanel'
import SettingsPanel from '../components/SettingsPanel'
import EntryMusic from '../components/EntryMusic'
import { useLetters } from '../hooks/useLetters'
import { sendLetter, markRead, deliverLetter, submitReaction, submitAnnotationReply, resolveLetterImages } from '../lib/letters'
import { supabase } from '../lib/supabase'
import { songGiftActions } from '../lib/songGifts'
import { sfxArrive } from '../lib/sfx'

export default function HomePage({ userId, profile, pair, partnerNickname, onChanged }) {
  const { annotationReplies, repliesLoading, repliesError, reloadReplies, letters, unread, mySealed, history, reactions, error, loading, reactionLoading, reactionError, reload, reloadReactions } = useLetters({ pair, userId })
  const [panel, setPanel] = useState(null)
  const [readingId, setReadingId] = useState(null)
  const partnerId = pair.user_a === userId ? pair.user_b : pair.user_a
  const reading = letters.find((letter) => letter.id === readingId)
  const prevUnread = useRef(null)
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

  function openLetter(letter) {
    setPanel(null)
    setReadingId(letter.id)
  }

  return (
    <CabinExperience onOpen={setPanel} unreadCount={unread.length}>
      {(error || loading) && <div role="status" className="panel-toast absolute left-4 right-4 top-20 z-30 w-fit max-w-[calc(100%_-_2rem)] px-3 py-2">{error || '正在读取内容…'}{error && <button onClick={reload} className="ml-3 underline">重试</button>}</div>}
      <WriteLetter open={panel === 'write'} onClose={() => setPanel(null)} pair={pair} userId={userId} onSend={sendLetter} onDone={reload} />
      <CalendarPanel open={panel === 'calendar'} onClose={() => setPanel(null)} history={history} unread={unread} mySealed={mySealed} userId={userId} onRead={openLetter} />
      <MailboxPanel open={panel === 'mailbox'} onClose={() => setPanel(null)} history={history}
        unread={unread} userId={userId} onRead={openLetter} loading={loading} error={error} retry={reload} />
      <SettingsPanel open={panel === 'settings'} onClose={() => setPanel(null)} profile={profile} pair={pair} partnerNickname={partnerNickname} onSave={saveNickname} onLogout={logout}
        songGiftActions={partnerId ? songGiftActions : undefined} />
      {reading && <ReadLetter key={reading.id} letter={reading} userId={userId} replies={annotationReplies[reading.id]} repliesLoading={repliesLoading} repliesError={repliesError} onRetryReplies={reloadReplies} onReply={(reply) => submitAnnotationReply({ ...reply, letter: reading, userId })} reaction={reactions[reading.id]} reactionLoading={reactionLoading} reactionError={reactionError} onRetryReactions={reloadReactions} onClose={() => setReadingId(null)} onChanged={reload} onMarkRead={markRead} onDeliver={deliverLetter} onReact={submitReaction} resolveImages={resolveLetterImages} />}
      <EntryMusic key={`${pair.id}:${userId}`} pairId={pair.id} partnerId={partnerId} partnerNickname={partnerNickname} />
    </CabinExperience>
  )
}
