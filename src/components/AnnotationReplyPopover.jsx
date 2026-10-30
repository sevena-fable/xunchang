import { useRef, useState } from 'react'
import AnnotationPopover from './AnnotationPopover'

export default function AnnotationReplyPopover({ range, items = [], anchor, compose = false, onReply, onSend, onClose }) {
  const lock = useRef(false)
  const requestId = useRef(crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState(`${range.tone || 'author'}:${range.id}`)
  const active = items.find((item) => `${item.tone}:${item.id}` === selected) || items[0] || range
  const close = () => { if (!lock.current) onClose() }

  async function send(note) {
    if (lock.current || !note.trim()) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      await onSend({ ...range, id: requestId.current, note })
      onClose()
    } catch (error) {
      setUncertain(!error.confirmedNotSent)
      setMessage(error.message)
    } finally { lock.current = false; setBusy(false) }
  }

  return (
    <AnnotationPopover
      key={compose ? 'compose' : `${active.tone}:${active.id}`}
      annotation={compose ? { note: '' } : active}
      anchor={anchor} editable={compose} tone={compose ? 'reply' : active.tone || 'author'}
      label={compose ? '批注回复' : '查看批注与回复'}
      contentLabel={compose || active.tone === 'reply' ? '批注回复内容' : '批注内容'}
      saveLabel={busy ? '正在发送…' : uncertain ? '确认上次回复' : '发送回复'}
      busy={busy} locked={uncertain} message={message} onSave={send} onClose={close}
      onReply={!compose ? onReply : undefined}
      navigation={compose ? [] : items.map((item, index) => ({
        id: `${item.tone}:${item.id}`, tone: item.tone,
        label: `${item.tone === 'author' ? '查看分享者批注' : '查看阅读者回复'}${items.filter((other) => other.tone === item.tone).length > 1 ? ` ${index + 1}` : ''}`,
        active: item === active, onSelect: () => setSelected(`${item.tone}:${item.id}`),
      }))}
    />
  )
}
