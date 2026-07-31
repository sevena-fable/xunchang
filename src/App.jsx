// 一羽 · Double Serenity —— 总指挥
// 根据"你走到哪一步"决定显示哪个画面：
//   未登录 → 注册/登录页
//   已登录但没有空间 → 配对页
//   有空间但在等对方 → 配对页（等待画面）
//   配对成功但没有鸽子 → 领养页
//   一切就绪 → 窗台首页
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import AuthPage from './pages/AuthPage'
import PairPage from './pages/PairPage'
import AdoptPage from './pages/AdoptPage'
import HomePage from './pages/HomePage'

// 白色羽毛 Logo：图片是黑底白羽，用"滤色"混合模式让黑色消失、羽毛融入天空
function Feather({ small }) {
  return (
    <img
      src="/feather.jpg"
      alt="一根白色羽毛"
      draggable="false"
      className={`${small ? 'h-20' : 'h-44'} w-auto feather-float select-none`}
      style={{ mixBlendMode: 'screen' }}
    />
  )
}

function App() {
  const [loading, setLoading] = useState(true)   // 首次打开时"正在查看你走到哪一步"
  const [session, setSession] = useState(null)   // 登录状态（有 = 已登录）
  const [profile, setProfile] = useState(null)   // 我的资料
  const [pair, setPair] = useState(null)         // 我的配对空间
  const [pigeon, setPigeon] = useState(null)     // 我们的鸽子
  const [partnerNickname, setPartnerNickname] = useState('')
  const [partnerOnline, setPartnerOnline] = useState(false) // 对方此刻在不在线（Presence）

  // 从数据库读取"我走到哪一步了"：资料 → 空间 → 鸽子
  const loadEverything = useCallback(async (currentSession) => {
    if (!currentSession) {
      setProfile(null); setPair(null); setPigeon(null)
      return
    }
    const user = currentSession.user

    // 1. 我的资料（没有就用注册时的昵称创建一份）
    let { data: prof } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (!prof) {
      const nickname = user.user_metadata?.nickname || '未命名'
      const { data: created } = await supabase
        .from('profiles').insert({ id: user.id, nickname }).select().single()
      prof = created
    }
    setProfile(prof)

    // 2. 我的空间（我是创建者或加入者）
    const { data: p } = await supabase
      .from('pairs').select('*')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .maybeSingle()
    setPair(p || null)

    // 3. 空间配对成功了才找鸽子和对方昵称
    if (p && p.status === 'paired') {
      const { data: bird } = await supabase
        .from('pigeons').select('*').eq('pair_id', p.id).maybeSingle()
      setPigeon(bird || null)

      const partnerId = p.user_a === user.id ? p.user_b : p.user_a
      const { data: partner } = await supabase
        .from('profiles').select('nickname').eq('id', partnerId).maybeSingle()
      setPartnerNickname(partner?.nickname || '')
    } else {
      setPigeon(null)
    }
  }, [])

  // 页面打开时：查一次登录状态，并持续监听登录/退出
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      await loadEverything(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
        loadEverything(newSession)
      }
    )
    return () => subscription.unsubscribe()
  }, [loadEverything])

  // 子页面完成操作后调用它，重新读取最新进度
  const refresh = useCallback(() => loadEverything(session), [loadEverything, session])

  // 配对成功后，用两个实时频道感知对方：
  //   ① Presence：对方是否正开着页面（在线状态）
  //   ② pigeons 表变化：对方召唤/溜达把鸽子挪动时，本端实时同步
  const userId = session?.user?.id
  const pairId = pair?.id
  const paired = pair?.status === 'paired'
  useEffect(() => {
    if (!userId || !pairId || !paired) { setPartnerOnline(false); return }

    // ① 在线状态：每个人在频道里"签到"，看到除自己外还有别人即为对方在线
    const presence = supabase.channel(`pair-${pairId}`, {
      config: { presence: { key: userId } },
    })
    presence
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState()
        setPartnerOnline(Object.keys(state).some((k) => k !== userId))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') presence.track({ at: Date.now() })
      })

    // ② 鸽子实时同步
    const birdChannel = supabase
      .channel(`pigeon-${pairId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pigeons', filter: `pair_id=eq.${pairId}` },
        (payload) => { if (payload.new) setPigeon(payload.new) },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(presence)
      supabase.removeChannel(birdChannel)
    }
  }, [userId, pairId, paired])

  // 决定当前显示哪个画面
  // 一切就绪后，画面就是那扇窗本身：全屏、没有页头页脚，不打扰
  if (!loading && session && profile && pair?.status === 'paired' && pigeon) {
    return (
      <HomePage
        userId={session.user.id}
        profile={profile}
        pair={pair}
        pigeon={pigeon}
        partnerNickname={partnerNickname}
        partnerOnline={partnerOnline}
        onChanged={refresh}
      />
    )
  }

  let screen
  if (loading) {
    screen = <p className="text-sky-700 animate-pulse tracking-widest">羽毛落下来的时间…</p>
  } else if (!session) {
    screen = <AuthPage />
  } else if (!profile) {
    screen = <p className="text-sky-700 animate-pulse tracking-widest">正在准备你的窗台…</p>
  } else if (!pair || pair.status === 'waiting') {
    screen = <PairPage userId={session.user.id} pair={pair} onChanged={refresh} />
  } else {
    screen = <AdoptPage pair={pair} onChanged={refresh} />
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center bg-cover bg-center px-4"
      style={{ backgroundImage: 'url(/bg-day.png)' }}
    >
      {/* 顶部：羽毛 + 产品名（登录后缩小，把空间让给内容） */}
      <div className="flex flex-col items-center mb-6">
        <Feather small={!!session} />
        <h1
          className={`${session ? 'text-3xl' : 'text-6xl'} tracking-[0.3em] mt-2 font-medium text-sky-900 transition-all`}
          style={{ textShadow: '0 1px 12px rgba(255,255,255,0.8)' }}
        >
          一羽
        </h1>
        {!session && (
          <p className="text-sm tracking-[0.5em] uppercase text-sky-800/70 mt-3">
            Double Serenity
          </p>
        )}
      </div>

      {/* 当前步骤的画面 */}
      {screen}

      {/* 底部状态 */}
      <p className="absolute bottom-3 z-10 text-xs text-emerald-950/60 tracking-widest">
        两扇窗 一只鸽子
      </p>
    </div>
  )
}

export default App
