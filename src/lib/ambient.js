// 环境音 —— 雨 / 风 / 炉火 / 鸟鸣，全部现场合成，无音频文件（规则 6.4）
// 由茶杯控制开关与切换。原理：噪声源 + 滤波器 + 缓慢起伏的调制，做出自然界的质感。

// 图标不写在这里：图标是手画 SVG，由 CupPanel 里的 Glyph 根据 key 画出来
export const AMBIENCES = [
  { key: 'off', label: '安静' },
  { key: 'rain', label: '雨声' },
  { key: 'wind', label: '风声' },
  { key: 'fire', label: '炉火' },
  { key: 'birds', label: '鸟鸣' },
]

let ctx = null
let master = null      // 总音量
let nodes = []         // 当前音景占用的节点，切换时全部停掉
let timers = []        // 随机事件的定时器（雨滴、柴火爆裂、鸟叫）
let level = 0.22       // 音量（0~0.5，默认很轻）
let playing = 'off'    // 现在放的是哪一种

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 循环播放的噪声源（2 秒素材首尾相接，听不出接缝）
function loopNoise(ac, kind = 'white') {
  const len = ac.sampleRate * 2
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d = buf.getChannelData(0)
  if (kind === 'brown') {
    // 棕噪声：低频更厚，像风、像远处的海
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.2
    }
  } else if (kind === 'pink') {
    // 粉噪声：介于白和棕之间，最接近自然界的"沙沙"
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099
      b1 = 0.963 * b1 + w * 0.283
      b2 = 0.57 * b2 + w * 1.907
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25
    }
  } else {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  const src = ac.createBufferSource()
  src.buffer = buf
  src.loop = true
  return src
}

// 一个缓慢起伏的调制器：让滤波器/音量自己呼吸，避免"机器味"
function lfo(ac, target, { freq = 0.08, amount = 300 }) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.frequency.value = freq
  g.gain.value = amount
  osc.connect(g).connect(target)
  osc.start()
  nodes.push(osc, g)
  return osc
}

function stopAll() {
  timers.forEach(clearTimeout)
  timers = []
  nodes.forEach((n) => { try { n.stop && n.stop() } catch { /* 已停止 */ } try { n.disconnect() } catch { /* 已断开 */ } })
  nodes = []
}

// 雨：粉噪声过低通（雨幕）+ 随机的小高频颗粒（雨滴打在窗上）
function buildRain(ac) {
  const src = loopNoise(ac, 'pink')
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.4
  const hp = ac.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 320
  const g = ac.createGain(); g.gain.value = 0.5
  src.connect(hp).connect(lp).connect(g).connect(master)
  src.start()
  nodes.push(src, lp, hp, g)
  lfo(ac, lp.frequency, { freq: 0.05, amount: 500 })

  // 零星雨滴
  const drop = () => {
    const t = ac.currentTime
    const o = ac.createOscillator(); const dg = ac.createGain()
    o.type = 'sine'
    o.frequency.setValueAtTime(1400 + Math.random() * 2200, t)
    o.frequency.exponentialRampToValueAtTime(600, t + 0.06)
    dg.gain.setValueAtTime(0.0001, t)
    dg.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.02, t + 0.006)
    dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    o.connect(dg).connect(master)
    o.start(t); o.stop(t + 0.12)
    timers.push(setTimeout(drop, 260 + Math.random() * 900))
  }
  timers.push(setTimeout(drop, 500))
}

// 风：棕噪声 + 极慢的低通扫动（一阵一阵地吹）
function buildWind(ac) {
  const src = loopNoise(ac, 'brown')
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.9
  const g = ac.createGain(); g.gain.value = 0.9
  src.connect(lp).connect(g).connect(master)
  src.start()
  nodes.push(src, lp, g)
  lfo(ac, lp.frequency, { freq: 0.045, amount: 420 })
  lfo(ac, g.gain, { freq: 0.03, amount: 0.35 })
}

// 炉火：低频呼呼 + 随机的柴火爆裂
function buildFire(ac) {
  const src = loopNoise(ac, 'brown')
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'; lp.frequency.value = 420
  const g = ac.createGain(); g.gain.value = 0.75
  src.connect(lp).connect(g).connect(master)
  src.start()
  nodes.push(src, lp, g)
  lfo(ac, g.gain, { freq: 0.35, amount: 0.25 })

  const crackle = () => {
    const t = ac.currentTime
    const n = ac.createBufferSource()
    const len = Math.floor(ac.sampleRate * 0.08)
    const b = ac.createBuffer(1, len, ac.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    n.buffer = b
    const bp = ac.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = 1200 + Math.random() * 2600; bp.Q.value = 2
    const cg = ac.createGain(); cg.gain.value = 0.05 + Math.random() * 0.09
    n.connect(bp).connect(cg).connect(master)
    n.start(t); n.stop(t + 0.1)
    timers.push(setTimeout(crackle, 120 + Math.random() * 700))
  }
  timers.push(setTimeout(crackle, 300))
}

// 鸟鸣：树叶底噪 + 随机的短啁啾（几个滑音音符组成一串）
function buildBirds(ac) {
  const src = loopNoise(ac, 'pink')
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5
  const g = ac.createGain(); g.gain.value = 0.12
  src.connect(bp).connect(g).connect(master)
  src.start()
  nodes.push(src, bp, g)
  lfo(ac, g.gain, { freq: 0.07, amount: 0.06 })

  const chirp = () => {
    const t0 = ac.currentTime
    const notes = 2 + Math.floor(Math.random() * 3)
    const base = 2000 + Math.random() * 1800
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.07 + Math.random() * 0.06)
      const o = ac.createOscillator(); const cg = ac.createGain()
      o.type = 'sine'
      const f = base * (0.85 + Math.random() * 0.4)
      o.frequency.setValueAtTime(f, t)
      o.frequency.exponentialRampToValueAtTime(f * (1.15 + Math.random() * 0.5), t + 0.05)
      cg.gain.setValueAtTime(0.0001, t)
      cg.gain.exponentialRampToValueAtTime(0.05, t + 0.012)
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
      o.connect(cg).connect(master)
      o.start(t); o.stop(t + 0.1)
    }
    timers.push(setTimeout(chirp, 1800 + Math.random() * 5200))
  }
  timers.push(setTimeout(chirp, 900))
}

// 切换音景（'off' 表示静音）。返回是否成功。
export function setAmbience(key) {
  const ac = audio()
  if (!ac) return false
  stopAll()
  playing = key
  if (key === 'off') {
    master.gain.cancelScheduledValues(ac.currentTime)
    master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6)
    return true
  }
  if (key === 'rain') buildRain(ac)
  else if (key === 'wind') buildWind(ac)
  else if (key === 'fire') buildFire(ac)
  else if (key === 'birds') buildBirds(ac)
  // 淡入，别惊到人
  master.gain.cancelScheduledValues(ac.currentTime)
  master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ac.currentTime)
  master.gain.linearRampToValueAtTime(level, ac.currentTime + 1.4)
  return true
}

// 拧大拧小声音（0~0.5）
export function setAmbienceVolume(v) {
  level = Math.max(0, Math.min(0.5, v))
  if (ctx && master && playing !== 'off') {
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.25)
  }
}
