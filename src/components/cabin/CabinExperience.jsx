import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sfxTap } from '../../lib/sfx'
import { toggleBgm, useBgmPlaying } from '../../lib/bgm'
import './cabin.css'

const labelsByView = { outside: '林间小屋', inside: '客厅', desk: '窗边书桌' }
const firstObject = { outside: 'door', inside: 'desk', desk: 'paper' }

export default function CabinExperience({ unreadCount, onOpen, children }) {
  const [view, setView] = useState('outside')
  const [status, setStatus] = useState('loading')
  const playing = useBgmPlaying()
  const host = useRef(null)
  const runtime = useRef(null)
  const points = useRef({})
  const focusTarget = useRef(null)
  const current = useRef({ view, unreadCount, playing })
  current.current = { view, unreadCount, playing }

  function focusDestination() {
    if (host.current?.dataset.moving === 'true' || !focusTarget.current) return
    const point = points.current[focusTarget.current]
    if (point && !point.hidden) {
      point.focus({ preventScroll: true })
      focusTarget.current = null
    }
  }

  useLayoutEffect(focusDestination, [view, status])

  useEffect(() => {
    let active = true
    import('./runtime').then(({ mountCabin }) => {
      if (!active) return
      runtime.current = mountCabin(host.current, points.current, () => {
        runtime.current?.dispose()
        runtime.current = null
        if (host.current) host.current.dataset.moving = 'false'
        Object.values(points.current).forEach((point) => point?.removeAttribute('style'))
        setStatus('fallback')
      }, focusDestination)
      runtime.current.change(current.current.view)
      runtime.current.setUnread(current.current.unreadCount)
      runtime.current.setMusic(current.current.playing)
      setStatus('ready')
    }).catch(() => { if (active) setStatus('fallback') })
    return () => {
      active = false
      runtime.current?.dispose()
      runtime.current = null
    }
  }, [])

  useEffect(() => { runtime.current?.setUnread(unreadCount) }, [unreadCount])
  useEffect(() => { runtime.current?.setMusic(playing) }, [playing])

  function go(next, event) {
    if (host.current?.dataset.moving === 'true') return
    focusTarget.current = event.detail === 0 ? firstObject[next] : null
    sfxTap()
    runtime.current?.change(next)
    setView(next)
  }
  function open(panel) {
    sfxTap()
    onOpen(panel)
  }
  function object(name, label, level, activate, count = 0, pressed) {
    return (
      <button key={name} type="button" ref={(node) => { points.current[name] = node }}
        className={`cabin-object cabin-object-${name}`} hidden={view !== level}
        aria-label={count ? `${label}，${count} 条未读内容` : label}
        aria-pressed={pressed} onClick={activate}>
        <span className="cabin-object-label">
          {label}
          {count > 0 && <span className="cabin-object-count">{count}</span>}
          {name === 'turntable' && <span aria-hidden="true" className="cabin-music-state">{pressed ? '正在播放' : '播放'}</span>}
        </span>
      </button>
    )
  }

  return (
    <main className="cabin-shell" data-cabin-view={view} data-cabin-status={status}>
      <div ref={host} className="cabin-world" aria-label={labelsByView[view]}>
        {status !== 'ready' && (
          <div className="cabin-still" aria-hidden="true" />
        )}
        <div className="cabin-objects">
          {object('door', '进屋', 'outside', (event) => go('inside', event))}
          {object('mailbox', '信箱', 'outside', () => open('mailbox'), unreadCount)}
          {object('desk', '走到桌前', 'inside', (event) => go('desk', event))}
          {object('paper', '给你看看', 'desk', () => open('write'))}
          {object('calendar', '台历', 'desk', () => open('calendar'), unreadCount)}
          {object('turntable', '唱片播放器', 'desk', toggleBgm, 0, playing)}
        </div>
      </div>
      <header className="cabin-header">
        <div className="cabin-wordmark">寻常</div>
        <span aria-live="polite">{labelsByView[view]}</span>
        {view !== 'outside' && (
          <button type="button" onClick={(event) => go(view === 'desk' ? 'inside' : 'outside', event)}>
            {view === 'desk' ? '‹ 返回客厅' : '‹ 回到屋外'}
          </button>
        )}
      </header>
      <button type="button" className="cabin-settings" aria-label="设置" onClick={() => open('settings')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="6.4" /><circle cx="12" cy="12" r="2.4" />
          <path strokeWidth="3" d="M17.8 12H20M16.1 16.1l1.56 1.56M12 17.8V20M7.9 16.1l-1.56 1.56M6.2 12H4M7.9 7.9 6.34 6.34M12 6.2V4M16.1 7.9l1.56-1.56" />
        </svg>
      </button>
      {view !== 'desk' && status === 'ready' && (
        <nav className="cabin-controls" aria-label="视角控制">
          <button type="button" aria-label="向左转" onClick={() => runtime.current?.orbit(23, 0)}>↶</button>
          <button type="button" aria-label="向右转" onClick={() => runtime.current?.orbit(-23, 0)}>↷</button>
          {view === 'outside' && <>
            <button type="button" aria-label="拉远" onClick={() => runtime.current?.zoom(130)}>−</button>
            <button type="button" aria-label="拉近" onClick={() => runtime.current?.zoom(-130)}>＋</button>
          </>}
          <button type="button" aria-label="重置视角" onClick={() => runtime.current?.reset()}>重置</button>
        </nav>
      )}
      {children}
    </main>
  )
}
