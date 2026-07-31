// 音效 —— 全部用浏览器自带的 Web Audio 现场合成，不依赖任何音频文件
// 好处：零体积、零版权问题、随时可调。原理：产生波形 → 过滤器塑形 → 音量包络 → 播放。
let ctx = null

// 浏览器要求"用户点过页面"才允许出声，所以第一次用到时才创建
function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 一段白噪声（雨声、纸声、翅膀声的原料）
function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

// 单个音：频率、时长、音量、波形、以及可选的滑音终点
function tone(ac, { freq, dur = 0.4, gain = 0.2, type = 'sine', to = null, delay = 0 }) {
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  // 包络：极快起音 + 指数衰减，听起来自然不生硬
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

// 一阵噪声：用带通滤波器把白噪声"调音"成沙沙声/风声
function noise(ac, { dur = 0.3, gain = 0.15, freq = 2400, q = 0.8, delay = 0, type = 'bandpass' }) {
  const t0 = ac.currentTime + delay
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, dur + 0.1)
  const filter = ac.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

// ===== 对外的几个音效 =====

// 摇铃：铜铃的清响（基音 + 两个不和谐泛音，才有金属味）
export function sfxBell() {
  const ac = audio(); if (!ac) return
  tone(ac, { freq: 1568, dur: 1.5, gain: 0.16, type: 'sine' })
  tone(ac, { freq: 2349, dur: 1.1, gain: 0.09, type: 'sine', delay: 0.01 })
  tone(ac, { freq: 3136, dur: 0.8, gain: 0.05, type: 'sine', delay: 0.02 })
  noise(ac, { dur: 0.12, gain: 0.05, freq: 5200, q: 1.5 })
}

// 纸张：抽出信纸的沙沙声
export function sfxPaper() {
  const ac = audio(); if (!ac) return
  noise(ac, { dur: 0.34, gain: 0.09, freq: 3000, q: 0.6 })
  noise(ac, { dur: 0.22, gain: 0.06, freq: 5200, q: 0.5, delay: 0.16 })
}

// 封信：火漆按下去的一记轻闷响
export function sfxSeal() {
  const ac = audio(); if (!ac) return
  tone(ac, { freq: 190, to: 90, dur: 0.26, gain: 0.22, type: 'sine' })
  noise(ac, { dur: 0.14, gain: 0.07, freq: 900, q: 0.7 })
}

// 拆信：撕开封口 + 纸张展开
export function sfxOpen() {
  const ac = audio(); if (!ac) return
  noise(ac, { dur: 0.2, gain: 0.1, freq: 4200, q: 0.5 })
  noise(ac, { dur: 0.4, gain: 0.08, freq: 2600, q: 0.6, delay: 0.14 })
  tone(ac, { freq: 880, to: 1320, dur: 0.5, gain: 0.05, type: 'triangle', delay: 0.2 })
}

// 翅膀：三下扑动（低频噪声脉冲）
export function sfxWings() {
  const ac = audio(); if (!ac) return
  for (let i = 0; i < 4; i++) {
    noise(ac, { dur: 0.13, gain: 0.13 - i * 0.02, freq: 320 + i * 60, q: 0.9, delay: i * 0.16, type: 'lowpass' })
  }
}

// 鸽子咕咕叫
export function sfxCoo() {
  const ac = audio(); if (!ac) return
  tone(ac, { freq: 420, to: 300, dur: 0.28, gain: 0.11, type: 'sine' })
  tone(ac, { freq: 380, to: 280, dur: 0.34, gain: 0.09, type: 'sine', delay: 0.32 })
}

// 送达提示：两声上行的轻音，像"信到了"
export function sfxArrive() {
  const ac = audio(); if (!ac) return
  tone(ac, { freq: 784, dur: 0.35, gain: 0.1, type: 'sine' })
  tone(ac, { freq: 1175, dur: 0.55, gain: 0.09, type: 'sine', delay: 0.14 })
}

// 界面轻点
export function sfxTap() {
  const ac = audio(); if (!ac) return
  tone(ac, { freq: 1100, dur: 0.09, gain: 0.05, type: 'sine' })
}

// 回应发出：一声温柔的心跳
export function sfxReact() {
  const ac = audio(); if (!ac) return
  tone(ac, { freq: 520, to: 700, dur: 0.3, gain: 0.11, type: 'triangle' })
  tone(ac, { freq: 700, to: 900, dur: 0.4, gain: 0.07, type: 'sine', delay: 0.13 })
}
