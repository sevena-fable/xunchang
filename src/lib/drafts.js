let database

export function draftKey(environment, userId, pairId) {
  return JSON.stringify([environment, userId, pairId])
}

export function emptyDraft() {
  return { id: crypto.randomUUID(), content: '', attachments: [], attempted: false }
}

function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('xunchang-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts')
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); database = null }
      resolve(db)
    }
    request.onerror = () => { database = null; reject(request.error) }
    request.onblocked = () => { database = null; reject(new Error('请关闭其他旧版本页面后重试')) }
  })
  return database
}

async function transaction(mode, action) {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode)
    const request = action(tx.objectStore('drafts'))
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error || new Error('草稿存储失败'))
    tx.onerror = () => reject(tx.error || new Error('草稿存储失败'))
  })
}

export async function acquireDraft(key) {
  if (!navigator.locks) throw new Error('当前浏览器无法保护多窗口草稿，请用最新版电脑浏览器通过 HTTPS 或本地预览打开')
  return new Promise((resolve, reject) => {
    navigator.locks.request(`xunchang-draft:${key}`, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(null); return }
      let unlock
      let released = false
      let pending = Promise.resolve()
      const lifetime = new Promise((done) => { unlock = done })
      resolve({
        run(action) {
          if (released) return Promise.reject(new Error('草稿编辑已结束，请重新打开'))
          const result = pending.then(action)
          pending = result.catch(() => {})
          return result
        },
        flush: () => pending,
        release() {
          if (released) return
          released = true
          // 发送与清理也必须完成后才能把草稿交给另一个窗口。
          pending.then(unlock)
        },
      })
      await lifetime
    }).catch(reject)
  })
}

export async function loadDraft(key) {
  return await transaction('readonly', (store) => store.get(key)) || emptyDraft()
}

export function saveDraft(key, draft) {
  return transaction('readwrite', (store) => store.put(draft, key))
}

export function clearDraft(key) {
  return transaction('readwrite', (store) => store.delete(key))
}
