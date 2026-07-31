// 写信面板 —— 写字、选信纸、夹一两张照片，然后封存或让鸽子送去
// 仪式感：点"让鸽子送去"后不会立刻关掉，会先盖一枚火漆印、听见翅膀声，再退场（阶段五）
import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { STATIONERY } from '../lib/stationery'
import { mySide } from '../lib/pigeon'
import { insertLetter, uploadLetterImage } from '../lib/letters'
import Panel, { PrimaryButton, GhostButton } from './Panel'
import { Feather } from './Glyphs'
import { sfxPaper, sfxSeal, sfxWings, sfxTap } from '../lib/sfx'

const MAX_IMAGES = 3

function WriteLetter({ open, onClose, pair, userId, pigeon, onDone }) {
  const [content, setContent] = useState('')
  const [stationery, setStationery] = useState('cream')
  const [images, setImages] = useState([])       // 已上传好的图片网址
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [ceremony, setCeremony] = useState(false) // 正在播"封蜡 + 飞走"
  const fileRef = useRef(null)

  const style = STATIONERY[stationery]
  // 规则 4.1：鸽子必须在你的窗台，才能叼着信飞走
  const side = mySide(pair, userId)
  const canSend = pigeon && pigeon.location === side

  function reset() {
    setContent(''); setImages([]); setMessage(''); setCeremony(false); setBusy(false)
  }

  async function pickImages(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // 允许重复选同一张
    if (!files.length) return
    const room = MAX_IMAGES - images.length
    if (room <= 0) { setMessage(`一封信里最多夹 ${MAX_IMAGES} 张照片`); return }

    setUploading(true); setMessage('')
    const urls = []
    for (const f of files.slice(0, room)) {
      if (f.size > 6 * 1024 * 1024) { setMessage('单张照片请小于 6MB'); continue }
      const { url, error } = await uploadLetterImage(f, userId)
      if (error) { setMessage('照片没夹进去：' + error.message); break }
      urls.push(url)
    }
    setImages((cur) => [...cur, ...urls])
    setUploading(false)
    if (urls.length) sfxPaper()
  }

  async function seal() {
    if (!content.trim() && images.length === 0) { setMessage('先写点什么吧'); return }
    setBusy(true); setMessage('')
    const error = await insertLetter({
      pairId: pair.id, userId, content, stationery, images, deliver: false,
    })
    setBusy(false)
    if (error) { setMessage('封存失败：' + error.message); return }
    sfxSeal()
    onDone()
    reset()
  }

  async function send() {
    if (!content.trim() && images.length === 0) { setMessage('先写点什么吧'); return }
    if (!canSend) {
      setMessage(`${pigeon?.name || '鸽子'} 此刻在对方窗台。先摇铃把它唤回来，它才能替你送信。`)
      return
    }
    setBusy(true); setMessage('')
    const error = await insertLetter({
      pairId: pair.id, userId, content, stationery, images, deliver: true,
    })
    if (error) { setBusy(false); setMessage('寄出失败：' + error.message); return }

    // 仪式：盖章 → 翅膀声 → 由 onDone 让鸽子叼着信飞去对方窗台
    setCeremony(true)
    sfxSeal()
    setTimeout(() => sfxWings(), 900)
    setTimeout(() => { onDone(); reset() }, 2100)
  }

  return (
    <Panel
      open={open}
      onClose={() => { if (!ceremony) { reset(); onClose() } }}
      title={ceremony ? '' : '写 一 封 信'}
      subtitle={ceremony ? '' : '慢慢写，它不着急'}
      width="max-w-2xl"
      tone={stationery === 'night' ? 'night' : 'paper'}
    >
      <AnimatePresence mode="wait">
        {ceremony ? (
          // ——— 送出的那一刻 ———
          <motion.div
            key="ceremony"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-64 flex-col items-center justify-center text-center"
          >
            <motion.div
              initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.5, ease: [0.3, 1.4, 0.4, 1] }}
              className="flex h-20 w-20 items-center justify-center rounded-full"
              style={{
                background: 'radial-gradient(circle at 36% 32%, #c85c4a, #8e2f22 72%, #6d2118)',
                boxShadow: '0 6px 18px rgba(110,30,20,0.45), inset 0 2px 6px rgba(255,255,255,0.25)',
              }}
            >
              <Feather size={34} stroke={1.3} />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
              className="mt-6 text-sm tracking-[0.25em] text-[#7a6142]"
            >
              信封好了
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.25 }}
              className="mt-2 text-xs tracking-[0.2em] text-[#9c8663]"
            >
              {pigeon?.name} 叼着它，从你的窗口飞了出去
            </motion.p>
          </motion.div>
        ) : (
          <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* 信纸本体：淡淡的横线，像真的信纸 */}
            <div
              className="rounded-xl p-1"
              style={{ background: style.paper, border: `1px solid ${style.border}`, boxShadow: 'inset 0 1px 8px rgba(0,0,0,0.06)' }}
            >
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="把想说的话，慢慢写在这里…"
                rows={9}
                maxLength={2000}
                className="w-full resize-none bg-transparent px-4 py-2 text-[15px] outline-none placeholder:opacity-40"
                style={{
                  color: style.ink,
                  lineHeight: '32px',
                  backgroundImage: `repeating-linear-gradient(transparent, transparent 31px, ${style.border} 32px)`,
                }}
              />

              {/* 夹进信里的照片 */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pb-3">
                  {images.map((url) => (
                    <div key={url} className="group relative">
                      <img
                        src={url}
                        alt="夹在信里的照片"
                        className="h-20 w-20 rounded-lg object-cover shadow-sm"
                        style={{ border: `1px solid ${style.border}` }}
                      />
                      <button
                        onClick={() => { sfxTap(); setImages((c) => c.filter((u) => u !== url)) }}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-stone-800/80 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="拿掉这张"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 信纸挑选 + 夹照片 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-xs text-[#8a7558]">信纸</span>
              {Object.entries(STATIONERY).map(([key, s]) => (
                <button
                  key={key}
                  onClick={() => { sfxPaper(); setStationery(key) }}
                  title={s.label}
                  className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-105 ${stationery === key ? 'scale-110' : 'opacity-70'}`}
                  style={{ backgroundColor: s.paper, borderColor: stationery === key ? '#8a6b3d' : s.border }}
                  aria-label={s.label}
                />
              ))}

              <span className="mx-2 h-4 w-px bg-[#d6c4a2]" />

              <button
                onClick={() => { sfxTap(); fileRef.current?.click() }}
                disabled={uploading || images.length >= MAX_IMAGES}
                className="rounded-full border border-[#c3ac82]/70 px-3 py-1 text-xs text-[#6b563b] transition-colors hover:bg-[#e8dcc0]/50 disabled:opacity-40"
              >
                {uploading ? '正在夹进去…' : `📎 夹张照片 ${images.length}/${MAX_IMAGES}`}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={pickImages}
                className="hidden"
              />
            </div>

            {message && <p className="mt-3 text-sm text-rose-600/90">{message}</p>}

            <div className="mt-6 flex items-center justify-end gap-3">
              <GhostButton onClick={seal} disabled={busy || uploading}>先 封 存</GhostButton>
              <PrimaryButton onClick={send} disabled={busy || uploading || !canSend}>
                {busy ? '请稍候…' : '让鸽子送去'}
              </PrimaryButton>
            </div>
            <p className="mt-3 text-right text-[11px] text-[#9c8663]">
              {canSend
                ? '封存的信会放在你桌上，之后随时可以寄出'
                : `${pigeon?.name || '鸽子'} 此刻不在你窗台，先摇铃唤它回来才能寄出；也可以先封存`}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  )
}

export default WriteLetter
