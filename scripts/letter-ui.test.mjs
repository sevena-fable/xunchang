import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium, expect } from '@playwright/test'

expect.extend({
  async toHavePaperText(locator, expected) {
    try {
      await expect.poll(() => locator.evaluate(async (element) => (await import('/src/lib/paper.js')).readPaperText(element))).toBe(expected)
      return { pass: true, message: () => 'Paper text matches' }
    } catch (error) {
      return { pass: false, message: () => error.message }
    }
  },
})

const PORT = process.env.TEST_PORT || '5187'
const BASE = `http://127.0.0.1:${PORT}`
let browser
let server
before(async () => {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', PORT, '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
  await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error('测试服务器未启动：' + output)), 20000)
    server.stdout.on('data', (data) => {
      output += data.toString().replace(/\u001b\[[0-9;]*m/g, '')
      if (output.includes(BASE)) { clearTimeout(timer); resolve() }
    })
    server.stderr.on('data', (data) => { output += data.toString() })
    server.once('error', reject)
    server.once('exit', (code) => { if (code) { clearTimeout(timer); reject(new Error(`测试服务器退出 ${code}`)) } })
  })
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true })
})
after(async () => { await browser?.close(); server?.kill() })

async function preview(viewport = { width: 1366, height: 768 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const backend = []
  const errors = []
  await page.route('**/*.supabase.co/**', (route) => { backend.push(route.request().url()); return route.abort() })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/preview.html`)
  return { context, page, backend, errors }
}
async function writer(page) {
  await page.bringToFront()
  await page.getByRole('button', { name: '给你看看', exact: true }).waitFor()
  const prompt = page.getByRole('dialog', { name: '背景音乐', exact: true })
  if (await prompt.isVisible()) await prompt.getByRole('button', { name: '先不听', exact: true }).click()
  await page.getByRole('button', { name: '给你看看', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '分享正文' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  return page.getByRole('textbox', { name: '分享正文' })
}

async function closeSharedPaper(page) {
  const dialog = page.getByRole('dialog', { name: '给你看看' })
  await expect(dialog.locator('.letter-status [role="status"]')).toHaveText('对方可以看到了')
  await expect(dialog.getByRole('textbox', { name: '分享正文' })).toBeEditable({ timeout: 500 })
  await expect(dialog.getByRole('textbox', { name: '分享正文' })).toHavePaperText('')
  await expect(page.locator('img[src*="wax-seal"]')).toHaveCount(0)
  await dialog.getByRole('button', { name: '关闭信纸' }).click({ timeout: 500 })
  await expect(dialog).toBeHidden()
}

async function expectReaction(page, label, note) {
  const panel = page.getByRole('dialog', { name: /的回应$/ })
  const icon = panel.getByRole('img', { name: label, exact: true })
  await expect(icon).toBeVisible()
  await expect(icon).toHaveJSProperty('naturalWidth', 160)
  await expect(panel.getByText(`「${note}」`, { exact: true })).toBeVisible()
  await expect(panel.getByText(label, { exact: true })).toHaveCount(0)
}

async function anotherPreview(context, backend, errors) {
  const page = await context.newPage()
  await page.route('**/*.supabase.co/**', (route) => { backend.push(route.request().url()); return route.abort() })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/preview.html`)
  return page
}

for (const reading of [false, true]) {
  test(`${reading ? 'reading' : 'writing'} paper ignores backdrop clicks but keeps explicit closing`, { timeout: 30000 }, async () => {
    const { context, page, backend, errors } = await preview()
    try {
      const text = '点击纸外仍留在这一页。\n' + '保留正文、段落和页码。'.repeat(100)
      const openReading = async () => {
        await page.getByRole('button', { name: '台历', exact: true }).click()
        const entry = page.getByRole('button', { name: /点击纸外仍留在这一页/ })
        if (!await entry.isVisible()) {
          const day = new Date().toLocaleDateString('en-CA')
          await page.locator(`button[aria-label^="${day}，"]`).click()
        }
        await entry.click()
      }
      const input = await writer(page)
      await input.fill(text)
      await input.press('Control+Home')
      if (reading) {
        await page.getByRole('button', { name: '分享给对方', exact: true }).click()
        await closeSharedPaper(page)
        await openReading()
      }
      const dialog = page.getByRole('dialog', { name: reading ? '查看内容' : '给你看看', exact: true })
      await dialog.getByRole('button', { name: '下一页', exact: true }).click()
      const pageNumber = await dialog.getByLabel('信纸页码').textContent()
      assert.match(pageNumber, /^2 \/ /)
      for (const [x, y] of [[8, 8], [1358, 8], [8, 760], [1358, 760]]) {
        await page.mouse.click(x, y)
        await expect(dialog).toBeVisible()
        await expect(dialog.getByLabel('信纸页码')).toHaveText(pageNumber)
        if (reading) assert.equal(await dialog.locator('.paper-reading').textContent(), text)
        else await expect(input).toHavePaperText(text)
      }
      const nestedTrigger = dialog.getByRole('button', { name: reading ? '回应' : '加出处', exact: true })
      await nestedTrigger.click()
      const nested = page.getByRole('dialog', { name: reading ? '对方的回应' : '加出处', exact: true })
      await expect(nested).toBeVisible()
      await page.mouse.click(8, 8)
      await expect(nested).toBeHidden()
      await expect(dialog).toBeVisible()
      await expect(nestedTrigger).toBeFocused()
      await expect(dialog.getByLabel('信纸页码')).toHaveText(pageNumber)
      await dialog.getByRole('button', { name: '关闭信纸', exact: true }).click()
      await expect(dialog).toBeHidden()
      if (reading) await openReading()
      else await expect(await writer(page)).toHavePaperText(text)
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      if (reading) await openReading()
      else await writer(page)
      await page.setViewportSize({ width: 800, height: 600 })
      await expect(dialog.getByText('把窗口放大些，再铺开这张纸。')).toBeVisible()
      await page.mouse.click(8, 8)
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: '收起', exact: true }).click()
      await expect(dialog).toBeHidden()
      assert.deepEqual(backend, [])
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
}

test('draft lock hands off fresh text and photos without stale saves or duplicate sharing', { timeout: 60000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const other = await anotherPreview(context, backend, errors)
    const input = await writer(page)
    await input.fill('第一个窗口的草稿')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V8AAAAASUVORK5CYII=', 'base64')
    await page.getByLabel('选择照片').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    const otherInput = await writer(other)
    await expect(other.getByText(/草稿正在另一个窗口/)).toBeVisible()
    await expect(otherInput).not.toBeEditable()
    await expect(otherInput).toHavePaperText('第一个窗口的草稿')
    await expect(other.getByRole('img', { name: '附件 1', exact: true })).toBeVisible()
    for (const name of ['加照片', '移除附件 1', '加出处', '分享给对方']) {
      await expect(other.getByRole('button', { name, exact: true })).toBeDisabled()
    }
    await other.getByRole('button', { name: '重试编辑' }).click()
    await expect(other.getByText(/草稿正在另一个窗口/)).toBeVisible()
    await page.bringToFront()
    await input.fill('交接前的最新草稿')
    await input.press('Escape')
    await expect(page.getByRole('dialog', { name: '给你看看' })).toBeHidden()
    await other.bringToFront()
    await other.getByRole('button', { name: '重试编辑' }).click()
    await expect(otherInput).toBeEditable()
    await expect(otherInput).toHavePaperText('交接前的最新草稿')
    await expect(other.getByRole('img', { name: '附件 1', exact: true })).toBeVisible()
    await otherInput.fill('第二个窗口接着写')
    await otherInput.press('Escape')
    await expect(other.getByRole('dialog', { name: '给你看看' })).toBeHidden()
    await expect(await writer(page)).toHavePaperText('第二个窗口接着写')
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await closeSharedPaper(page)
    await expect(await writer(other)).toHavePaperText('')
    await expect(other.getByRole('img', { name: '附件 1', exact: true })).toHaveCount(0)
    await expect(other.getByRole('button', { name: '分享给对方', exact: true })).toBeDisabled()
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('draft lock stays with unsaved text when the paper closes and releases after recovery', { timeout: 60000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const other = await anotherPreview(context, backend, errors)
    const input = await writer(page)
    await input.fill('已经保存的旧内容')
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    await page.evaluate(() => {
      window.originalDraftPut = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function () { throw new DOMException('test quota', 'QuotaExceededError') }
    })
    await input.fill('不能被另一个窗口覆盖的未保存内容')
    await expect(page.getByRole('alert')).toContainText('草稿未保存')
    await input.press('Escape')
    await expect(page.getByRole('dialog', { name: '给你看看' })).toBeHidden()
    const otherInput = await writer(other)
    await expect(other.getByText(/草稿正在另一个窗口/)).toBeVisible()
    await expect(otherInput).not.toBeEditable()
    await expect(await writer(page)).toHavePaperText('不能被另一个窗口覆盖的未保存内容')
    await expect(page.getByRole('alert')).toContainText('草稿未保存')
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalDraftPut })
    await input.fill('恢复后保存的新内容')
    await input.press('Escape')
    await expect(page.getByRole('dialog', { name: '给你看看' })).toBeHidden()
    await other.getByRole('button', { name: '重试编辑' }).click()
    await expect(otherInput).toBeEditable()
    await expect(otherInput).toHavePaperText('恢复后保存的新内容')
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('draft lock holds until queued work settles even after its owner releases', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const other = await anotherPreview(context, backend, errors)
    await page.evaluate(async () => {
      const { acquireDraft, draftKey, emptyDraft, saveDraft } = await import('/src/lib/drafts.js')
      window.testDraftKey = draftKey('preview', 'test-owner', 'test-pair')
      window.testEditor = await acquireDraft(window.testDraftKey)
      const gate = new Promise((resolve) => { window.finishDraftWork = resolve })
      window.draftWork = window.testEditor.run(async () => {
        await gate
        await saveDraft(window.testDraftKey, { ...emptyDraft(), content: '操作完成后才可交接', attempted: true })
      })
      window.testEditor.release()
      await window.testEditor.run(() => {}).then(() => { throw new Error('released editor accepted a write') }, () => {})
    })
    assert.equal(await other.evaluate(async () => {
      const { acquireDraft, draftKey } = await import('/src/lib/drafts.js')
      return await acquireDraft(draftKey('preview', 'test-owner', 'test-pair')) === null
    }), true)
    await page.evaluate(async () => { window.finishDraftWork(); await window.draftWork })
    const recovered = await other.evaluate(async () => {
      const { acquireDraft, draftKey, loadDraft } = await import('/src/lib/drafts.js')
      const key = draftKey('preview', 'test-owner', 'test-pair')
      const editor = await acquireDraft(key)
      if (!editor) throw new Error('completed editor still holds lock')
      try { return await editor.run(() => loadDraft(key)) } finally { editor.release() }
    })
    assert.equal(recovered.content, '操作完成后才可交接')
    assert.equal(recovered.attempted, true)
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('draft lock fails closed when unavailable and releases when its owning tab exits', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const other = await anotherPreview(context, backend, errors)
    const input = await writer(page)
    await input.fill('关闭标签后继续的草稿')
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    const otherInput = await writer(other)
    await expect(other.getByText(/草稿正在另一个窗口/)).toBeVisible()
    await page.close()
    await other.getByRole('button', { name: '重试编辑' }).click()
    await expect(otherInput).toBeEditable()
    await expect(otherInput).toHavePaperText('关闭标签后继续的草稿')
    await otherInput.press('Escape')
    await other.addInitScript(() => { Object.defineProperty(navigator, 'locks', { value: undefined }) })
    await other.reload()
    await writer(other)
    await expect(other.getByText(/当前浏览器无法保护多窗口草稿/)).toBeVisible()
    await expect(otherInput).not.toBeEditable()
    await expect(other.getByRole('button', { name: '分享给对方', exact: true })).toBeDisabled()
    await other.getByRole('button', { name: '关闭信纸' }).click()
    await expect(other.getByRole('dialog', { name: '给你看看' })).toBeHidden()
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

async function expectWholePaper(page) {
  await expect.poll(() => page.evaluate(() => {
    const sheet = document.querySelector('.letter-sheet').getBoundingClientRect()
    const workspace = document.querySelector('.letter-workspace').getBoundingClientRect()
    const body = document.querySelector('.paper-body').clientHeight
    const height = document.querySelector('.paper-window').clientHeight
    return Math.abs(sheet.width / sheet.height - 1.5) < 0.01 &&
      workspace.top >= 31 && workspace.bottom <= innerHeight - 31 &&
      sheet.left >= 31 && sheet.right <= innerWidth - 31 &&
      height >= 288 && height === Math.floor(body / 36) * 36
  })).toBe(true)
}

for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 600]]) {
  test(`fixed landscape paper and long text at ${width}x${height}`, { timeout: 60000 }, async () => {
    const { context, page, backend, errors } = await preview({ width, height })
    try {
      const input = await writer(page)
      const text = '  开头的空格\n\n' + '今天的风很轻，窗外的树叶慢慢摇晃。我想把这些寻常的日子写给你。'.repeat(180) + '\n\n最后一行  '
      await input.fill(text)
      await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect(input).toHaveCSS('font-family', /^"LXGW WenKai"/)
      await expect(page.locator('.paper-mirror')).toHaveCSS('font-family', /^"LXGW WenKai"/)
      assert.equal(await page.evaluate(() => Array.from(document.fonts).some((font) => font.family.replaceAll('"', '').replaceAll("'", '') === 'LXGW WenKai' && font.status === 'loaded')), true)
      const metrics = await page.evaluate(() => {
        const sheet = document.querySelector('.letter-sheet').getBoundingClientRect()
        const input = document.querySelector('.paper-editor')
        const clone = input.cloneNode(true)
        Object.assign(clone.style, { width: input.clientWidth + 'px', minHeight: '0', position: 'fixed', visibility: 'hidden', transform: 'none' })
        document.querySelector('.letter-sheet').append(clone)
        const nativeHeight = clone.clientHeight
        clone.remove()
        const body = document.querySelector('.paper-body').getBoundingClientRect()
        const previous = document.querySelector('[aria-label="上一页"]').getBoundingClientRect()
        const next = document.querySelector('[aria-label="下一页"]').getBoundingClientRect()
        return { width: sheet.width, height: sheet.height, left: sheet.left, top: sheet.top, right: sheet.right, bottom: sheet.bottom, scroll: input.scrollTop, font: getComputedStyle(input).fontSize, mirrorHeight: document.querySelector('.paper-mirror').offsetHeight, nativeHeight, pages: document.querySelector('output').textContent, bodyHeight: body.height, pageHeight: document.querySelector('.paper-window').clientHeight, arrowsBesideText: previous.right < body.left && next.left > body.right, arrowCenter: previous.top + previous.height / 2 }
      })
      assert.ok(metrics.width > metrics.height)
      assert.ok(metrics.left >= 31 && metrics.top >= 31 && metrics.right <= width - 31 && metrics.bottom < height - 60)
      assert.equal(metrics.font, '20px')
      assert.equal(metrics.scroll, 0)
      assert.equal(metrics.nativeHeight, metrics.mirrorHeight)
      assert.ok(metrics.pageHeight >= 8 * 36, '正文必须至少显示八整行，而不是一行')
      assert.equal(metrics.pageHeight, Math.floor(metrics.bodyHeight / 36) * 36)
      assert.equal(metrics.arrowsBesideText, true)
      assert.ok(Math.abs(metrics.arrowCenter - (metrics.top + metrics.height / 2)) < 2)
      assert.ok(Number(metrics.pages.split('/')[1]) > 1)
      await input.press('Control+Home')
      await expect(page.getByLabel('信纸页码')).toHaveText(/^1 \/ /)
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      await expect(page.getByLabel('信纸页码')).toHaveText(/^2 \/ /)
      await page.mouse.move(width / 2, height / 2)
      await page.mouse.wheel(0, 1000)
      assert.equal(await input.evaluate((element) => element.scrollTop), 0)
      await input.press('Control+End')
      await input.press('End')
      await input.pressSequentially('x')
      await input.press('Control+z')
      await expect(input).toHavePaperText(text)
      await input.press('Control+Shift+z')
      await expect(input).toHavePaperText(text + 'x')
      await input.press('Control+z')
      await input.press('Escape')
      const reopened = await writer(page)
      await expect(reopened).toHavePaperText(text)
      await page.reload()
      await expect(await writer(page)).toHavePaperText(text)
      assert.deepEqual(backend, [])
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
}

for (const mode of ['writing', 'reading']) {
  test(`paper survives live resizing and the window hint while ${mode}`, { timeout: 60000 }, async () => {
    const { context, page, backend, errors } = await preview()
    try {
      const input = await writer(page)
      const text = '窗口往返测试。\n' + '保留正在读写的位置，（中文标点）和整页正文都不能丢。'.repeat(220)
      await input.fill(text)
      await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
      if (mode === 'reading') {
        await page.getByRole('button', { name: '分享给对方', exact: true }).click()
        await closeSharedPaper(page)
        await page.getByRole('button', { name: '台历', exact: true }).click()
        const day = new Date().toLocaleDateString('en-CA')
        await page.locator(`button[aria-label^="${day}，"]`).click()
        await page.getByRole('button', { name: /窗口往返测试/ }).click()
      } else {
        await input.press('Control+Home')
      }
      const next = page.getByRole('button', { name: '下一页', exact: true })
      await next.click()
      await next.click()
      if (mode === 'writing') {
        await input.press('Shift+ArrowRight')
        await input.press('Shift+ArrowLeft')
        await input.press('Shift+ArrowLeft')
      }
      await expectWholePaper(page)
      const pageNumber = await page.getByLabel('信纸页码').textContent()
      const selection = () => input.evaluate(async (element) => (await import('/src/lib/paper.js')).paperSelection(element))
      const selected = mode === 'writing' ? await selection() : null
      const focused = mode === 'writing' ? input : next
      await expect(focused).toBeFocused()
      for (const viewport of [{ width: 1200, height: 700 }, { width: 900, height: 600 }, { width: 1366, height: 768 }]) {
        await page.setViewportSize(viewport)
        await expectWholePaper(page)
        await expect(focused).toBeFocused()
        if (selected) assert.deepEqual(await selection(), selected)
      }
      await expect(page.getByLabel('信纸页码')).toHaveText(pageNumber)
      for (const viewport of [{ width: 1024, height: 576 }, { width: 899, height: 768 }]) {
        await page.setViewportSize(viewport)
        const hint = page.getByRole('button', { name: '收起', exact: true })
        await expect(hint).toBeFocused()
        await expect(page.locator('.letter-workspace')).toBeHidden()
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => !document.hasFocus() || document.activeElement === document.querySelector('.paper-window-hint button')), true)
        await page.keyboard.press('Shift+Tab')
        await expect(hint).toBeFocused()
        await page.setViewportSize({ width: 900, height: 600 })
        await expectWholePaper(page)
        await expect(focused).toBeFocused()
        if (selected) assert.deepEqual(await selection(), selected)
        await page.setViewportSize({ width: 1366, height: 768 })
        await expectWholePaper(page)
        await expect(page.getByLabel('信纸页码')).toHaveText(pageNumber)
      }
      if (mode === 'writing') {
        await expect(input).toHavePaperText(text)
        await input.pressSequentially('x')
        await input.press('Control+z')
        await expect(input).toHavePaperText(text)
        const photos = page.getByRole('button', { name: '加照片', exact: true })
        await photos.focus()
        await page.setViewportSize({ width: 899, height: 768 })
        await expect(page.getByRole('button', { name: '收起', exact: true })).toBeFocused()
        await page.setViewportSize({ width: 1366, height: 768 })
        await expect(photos).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(await writer(page)).toHavePaperText(text)
        await expectWholePaper(page)
      } else {
        await expect(page.locator('.paper-reading')).toHaveText(text)
        await page.getByRole('button', { name: '回应', exact: true }).click()
        const reaction = page.getByRole('dialog', { name: '对方的回应', exact: true })
        const closeReaction = reaction.getByRole('button', { name: '关闭', exact: true })
        await expect(closeReaction).toBeFocused()
        await page.setViewportSize({ width: 899, height: 768 })
        await expect(closeReaction).toBeFocused()
        await page.setViewportSize({ width: 1366, height: 768 })
        await expect(closeReaction).toBeFocused()
        await page.keyboard.press('Escape')
        await expect(page.getByLabel('信纸页码')).toHaveText(pageNumber)
      }
      assert.deepEqual(backend, [])
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
}

test('paper restores an available focus target when reflow disables a page arrow', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview({ width: 900, height: 600 })
  try {
    const input = await writer(page)
    const text = '边界测试，窗口改变。'.repeat(35)
    await input.fill(text)
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await closeSharedPaper(page)
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await page.getByRole('button', { name: /边界测试/ }).click()
    await expect(page.getByLabel('信纸页码')).toHaveText('1 / 2')
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await page.getByRole('button', { name: '上一页', exact: true }).focus()
    await page.setViewportSize({ width: 899, height: 600 })
    await expect(page.getByRole('button', { name: '收起', exact: true })).toBeFocused()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.getByLabel('信纸页码')).toHaveText('1 / 1')
    await expect(page.getByRole('button', { name: '上一页', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '关闭信纸', exact: true })).toBeFocused()
    await expect(page.locator('.paper-reading')).toHaveText(text)
    await expectWholePaper(page)
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('paper text mapping preserves paragraphs, whitespace and both selection directions', { timeout: 30000 }, async () => {
  const { context, page, errors } = await preview()
  try {
    const result = await page.evaluate(async () => {
      const { readPaperText, writePaperText, paperSelection, selectPaperText } = await import('/src/lib/paper.js')
      const root = document.createElement('div')
      root.contentEditable = 'plaintext-only'
      root.style.whiteSpace = 'pre-wrap'
      document.body.append(root)
      const cases = [
        ['', ''],
        ['a\n\n', 'a\n'],
        ['a\n<div><br></div>', 'a\n'],
        ['a\n<div>b</div>', 'a\nb'],
        ['a<div>b</div><div><br></div><div>c</div><div><br></div>', 'a\nb\n\nc\n'],
        ['<div>a</div><div>\n<br></div>', 'a\n\n'],
        ['<div><br></div><div>  空格\t与表情🐦 </div><div><br></div>', '\n  空格\t与表情🐦 \n'],
        ['a<br>b<br><br>', 'a\nb\n'],
      ]
      const failures = []
      for (const [html, expected] of cases) {
        root.innerHTML = html
        if (readPaperText(root) !== expected) failures.push({ html, expected, actual: readPaperText(root) })
      }
      for (const expected of ['', '\n', '\n\n', '  原文\t空格。\n\n第二段🐦\n', '<b>只是文本</b>']) {
        writePaperText(root, expected)
        if (readPaperText(root) !== expected) failures.push({ expected, actual: readPaperText(root) })
        for (let offset = 0; offset <= expected.length; offset++) {
          selectPaperText(root, offset, expected.length - offset)
          const selection = paperSelection(root)
          if (selection.anchor !== offset || selection.focus !== expected.length - offset) failures.push({ offset, selection })
        }
        if (root.querySelector('b, img, script')) failures.push('Plain text became HTML')
      }
      root.remove()
      return failures
    })
    assert.deepEqual(result, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

for (const [width, height] of [[1920, 1080], [1366, 768], [1024, 600], [900, 600]]) {
  test(`paragraph indents and baseline grid agree at ${width}x${height}`, { timeout: 30000 }, async () => {
    const { context, page, backend, errors } = await preview({ width, height })
    try {
      const input = await writer(page)
      const first = '窗'.repeat(85) + '。'
      const second = '树'.repeat(45) + '。'
      const text = `${first}\n${second}\n\n最后一段。`
      await input.fill(text)
      await page.evaluate(() => document.fonts.ready)
      const metrics = await page.evaluate(async ({ starts, text }) => {
        const { selectPaperText } = await import('/src/lib/paper.js')
        const mirror = document.querySelector('.paper-mirror')
        const editor = document.querySelector('.paper-editor')
        const sheet = document.querySelector('.letter-sheet')
        const window = document.querySelector('.paper-window')
        const range = document.createRange()
        const at = (index) => {
          range.setStart(mirror.firstChild, index); range.setEnd(mirror.firstChild, index + 1)
          const rect = range.getBoundingClientRect(), box = mirror.getBoundingClientRect()
          return { x: rect.x - box.x, y: rect.y - box.y }
        }
        const firstY = at(0).y
        const wrap = Array.from({ length: 85 }, (_, index) => index).find((index) => at(index).y > firstY)
        const samples = [...starts, wrap, text.length - 1].map((index) => {
          const mirrored = at(index)
          selectPaperText(editor, index, index + 1)
          const rect = getSelection().getRangeAt(0).getBoundingClientRect(), box = editor.getBoundingClientRect()
          return { index, mirrored, edited: { x: rect.x - box.x, y: rect.y - box.y } }
        })
        return {
          samples, wrap, lineHeight: getComputedStyle(editor).lineHeight,
          grid: getComputedStyle(window).backgroundSize, letterSpacing: getComputedStyle(editor).letterSpacing,
          textIndent: getComputedStyle(editor).textIndent, offset: getComputedStyle(editor).top,
          padding: parseFloat(getComputedStyle(sheet).paddingLeft), mirrorOffset: getComputedStyle(mirror).top,
        }
      }, { starts: [0, first.length + 1, first.length + second.length + 3], text })
      for (const sample of metrics.samples) {
        assert.ok(Math.abs(sample.edited.x - sample.mirrored.x) < 1)
        assert.ok(Math.abs(sample.edited.y - sample.mirrored.y) < 1)
        if (sample.index === metrics.wrap) assert.equal(sample.mirrored.x, 0)
        else if (sample.index !== text.length - 1) assert.equal(sample.mirrored.x, 40)
      }
      assert.equal(metrics.lineHeight, '36px')
      assert.equal(metrics.grid, '100% 36px')
      assert.equal(metrics.letterSpacing, '0.6px')
      assert.equal(metrics.textIndent, '40px each-line')
      assert.equal(metrics.offset, '4px')
      assert.equal(metrics.mirrorOffset, metrics.offset)
      assert.ok(metrics.padding >= 60 && metrics.padding <= 90)
      await expect(input).toHavePaperText(text)
      await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '分享给对方', exact: true }).click()
      await closeSharedPaper(page)
      await page.getByRole('button', { name: '台历', exact: true }).click()
      const day = new Date().toLocaleDateString('en-CA')
      await page.locator(`button[aria-label^="${day}，"]`).click()
      await page.getByRole('button', { name: /窗窗窗/ }).click()
      assert.equal(await page.locator('.paper-reading').textContent(), text)
      await expect(page.locator('.paper-reading')).toHaveCSS('top', '4px')
      await expect(page.locator('.paper-reading')).toHaveCSS('text-indent', '40px each-line')
      assert.deepEqual(backend, [])
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
}

test('plain editing preserves enter, undo, blank lines and saved original text', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const input = await writer(page)
    const text = '  第一段。\n\n第二段\t保留空格🐦'
    await input.fill(text)
    await input.press('Control+End')
    await input.press('ArrowLeft')
    await input.press('ArrowRight')
    await input.press('Enter')
    await expect(input).toHavePaperText(text + '\n')
    await input.press('Control+z')
    await expect(input).toHavePaperText(text)
    await input.press('Control+Shift+z')
    await expect(input).toHavePaperText(text + '\n')
    await input.press('Enter')
    await input.press('Enter')
    await expect(input).toHavePaperText(text + '\n\n\n')
    await page.keyboard.insertText('末段')
    const final = text + '\n\n\n末段'
    await expect(input).toHavePaperText(final)
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    await page.reload()
    await expect(await writer(page)).toHavePaperText(final)
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await closeSharedPaper(page)
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await page.getByRole('button', { name: /第一段/ }).click()
    assert.equal(await page.locator('.paper-reading').textContent(), final)
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('plain editing preserves cross-paragraph deletion, copying and cutting', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const input = await writer(page)
    const text = '  开始的段落。\n\n第二段🐦\n结尾。\n'
    await input.fill(text)
    const end = text.indexOf('结尾')
    await input.evaluate(async (element, end) => (await import('/src/lib/paper.js')).selectPaperText(element, 3, end), end)
    await input.press('Backspace')
    await expect(input).toHavePaperText(text.slice(0, 3) + text.slice(end))
    await input.press('Control+z')
    await expect(input).toHavePaperText(text)
    await input.press('Control+a')
    await input.press('Control+c')
    assert.equal(await page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')), text)
    await input.press('Control+x')
    await expect(input).toHavePaperText('')
    assert.equal(await page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')), text)
    await input.press('Control+z')
    await expect(input).toHavePaperText(text)
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('plain editing strips rich paste and commits composition without duplicate text', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const input = await writer(page)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const text = '粘贴的段落。\n\n<img src=x onerror="window.paperInjected=true">\n'
    await page.evaluate(async (text) => {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob(['<b>粘贴的段落。</b><div><img src=x onerror="window.paperInjected=true"></div>'], { type: 'text/html' }),
      })])
    }, text)
    await input.press('Control+v')
    await expect(input).toHavePaperText(text)
    await expect(input.locator('b, img, script')).toHaveCount(0)
    assert.equal(await page.evaluate(() => window.paperInjected), undefined)
    await input.press('Control+End')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.imeSetComposition', { text: '寻常', selectionStart: 2, selectionEnd: 2 })
    const pageNumber = await page.getByLabel('信纸页码').textContent()
    await input.dispatchEvent('keydown', { key: 'PageDown', isComposing: true })
    await expect(page.getByLabel('信纸页码')).toHaveText(pageNumber)
    await cdp.send('Input.insertText', { text: '寻常' })
    await expect(input).toHavePaperText(text + '寻常')
    await input.press('Control+a')
    await page.keyboard.insertText('替换后的正文。')
    await expect(input).toHavePaperText('替换后的正文。')
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('Chinese line breaking keeps punctuation pairs and all text', { timeout: 60000 }, async () => {
  const { context, page } = await preview()
  try {
    const input = await writer(page)
    const text = Array.from({ length: 50 }, (_, index) => '字'.repeat(index) + '（你好），「窗外」的《日子》……慢慢地——过去了！English words and averylongword'.repeat(2)).join('\n')
    await input.fill(text)
    await page.evaluate(() => document.fonts.ready)
    const bad = await page.evaluate(() => {
      const mirror = document.querySelector('.paper-mirror'), node = mirror.firstChild
      const text = node.data.slice(0, -1)
      const range = document.createRange()
      let previousTop
      const invalid = []
      for (let index = 0; index < text.length; index++) {
        range.setStart(node, index); range.setEnd(node, index + 1)
        const top = range.getBoundingClientRect().top
        if (previousTop !== undefined && top > previousTop + 10 && text[index - 1] !== '\n' && text[index] !== '\n') {
          if ('，。、？！：；）》」』】'.includes(text[index]) || '（《「『【'.includes(text[index - 1]) || (text[index] === text[index - 1] && '…—'.includes(text[index]))) invalid.push(text.slice(Math.max(0, index - 3), index + 3))
        }
        previousTop = top
      }
      return invalid
    })
    assert.deepEqual(bad, [])
    await expect(input).toHavePaperText(text)
  } finally { await context.close() }
})

test('preview restores photo draft, sends once, reads and responds without backend', { timeout: 60000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const input = await writer(page)
    await input.fill('这封信带着一张照片。')
    await page.getByLabel('选择照片').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await expect(page.getByText(/请选择 JPG/)).toBeVisible()
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V8AAAAASUVORK5CYII=', 'base64')
    await page.getByLabel('选择照片').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
    await expect(page.getByRole('img', { name: '附件 1', exact: true })).toBeVisible()
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    await input.press('Escape')
    await page.reload()
    await expect(await writer(page)).toHavePaperText('这封信带着一张照片。')
    await expect(page.getByRole('img', { name: '附件 1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '分享给对方', exact: true }).dblclick()
    await closeSharedPaper(page)
    await expect(await writer(page)).toHavePaperText('')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '台历', exact: true }).click()
    await expect(page.getByLabel('还没看过')).toBeVisible()
    await expect(page.getByLabel('还未分享')).toBeVisible()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await expect(page.getByRole('button', { name: /这封信带着一张照片/ })).toHaveCount(1)
    await page.getByRole('button', { name: /这封信带着一张照片/ }).click()
    await expect(page.locator('.paper-reading')).toHaveText('这封信带着一张照片。')
    await expect(page.getByRole('button', { name: '查看照片 1' })).toBeVisible()
    await page.getByRole('button', { name: '查看照片 1' }).click()
    await expect(page.getByRole('img', { name: '放大的照片' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '查看内容', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '查看内容', exact: true }).click()
    await expect(page.locator('.paper-reading')).toBeVisible()
    await expect(page.getByRole('button', { name: '拆开信封' })).toHaveCount(0)
    await expect(page.locator('img[src*="envelope-"]')).toHaveCount(0)
    await page.getByRole('button', { name: '留个回应' }).click()
    const choices = page.getByRole('dialog', { name: '你的回应', exact: true }).getByRole('button', { pressed: false })
    await expect(choices.getByRole('img')).toHaveCount(4)
    for (const label of ['下次聊聊', '喜欢', '点赞', '狗头']) await expect(page.getByRole('dialog', { name: '你的回应', exact: true }).getByText(label, { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '喜欢', exact: true }).click()
    await expect(page.getByRole('button', { name: '喜欢', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByLabel('回应短评').fill('收到了')
    await page.getByRole('button', { name: '送出回应', exact: true }).click()
    await expectReaction(page, '喜欢', '收到了')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByLabel('你的昵称', { exact: true }).fill('新昵称')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText('已保存', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

for (const viewport of [{ width: 1366, height: 768 }, { width: 900, height: 600 }]) {
  test(`writer previews complete photos and restores focus at ${viewport.width}x${viewport.height}`, { timeout: 30000 }, async () => {
    const { context, page, backend, errors } = await preview(viewport)
    try {
      const { default: sharp } = await import('sharp')
      const dimensions = [[1200, 1800], [1800, 1200], [800, 800]]
      const files = await Promise.all(dimensions.map(async ([width, height], index) => ({
        name: `photo-${index}.png`, mimeType: 'image/png',
        buffer: await sharp({ create: { width, height, channels: 3, background: '#e5d3ad' } }).png().toBuffer(),
      })))
      const input = await writer(page)
      const text = '预览不应改变正文和页码。'.repeat(100)
      await input.fill(text)
      await input.press('Control+Home')
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      const pageNumber = await page.getByLabel('信纸页码').textContent()
      await page.getByLabel('选择照片').setInputFiles(files)
      await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
      await expectWholePaper(page)
      for (let index = 0; index < files.length; index++) {
        const trigger = page.getByRole('button', { name: `预览照片 ${index + 1}`, exact: true })
        if (index === 0) { await trigger.focus(); await trigger.press('Enter') }
        else await trigger.click()
        const dialog = page.getByRole('dialog', { name: '预览照片', exact: true })
        const image = dialog.getByRole('img', { name: '分享前的完整照片', exact: true })
        await expect(image).toBeVisible()
        await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true)
        const metrics = await image.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return { width: element.naturalWidth, height: element.naturalHeight, fit: getComputedStyle(element).objectFit, withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight }
        })
        assert.deepEqual([metrics.width, metrics.height], dimensions[index])
        assert.equal(metrics.fit, 'contain')
        assert.equal(metrics.withinViewport, true)
        const close = dialog.getByRole('button', { name: '关闭照片', exact: true })
        await expect(close).toBeFocused()
        if (index === 0) await page.keyboard.press('Escape')
        else if (index === 1) await close.click()
        else await page.mouse.click(8, 8)
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
        await expect(input).toHavePaperText(text)
        await expect(page.getByLabel('信纸页码')).toHaveText(pageNumber)
      }
      await page.getByRole('button', { name: '移除附件 2', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '预览照片', exact: true })).toBeHidden()
      await expect(page.locator('.preview-photo')).toHaveCount(2)
      await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
      await page.reload()
      await expect(await writer(page)).toHavePaperText(text)
      await expect(page.locator('.preview-photo')).toHaveCount(2)
      await page.getByRole('button', { name: '预览照片 2', exact: true }).click()
      await expect.poll(() => page.getByRole('img', { name: '分享前的完整照片' }).evaluate((element) => element.naturalWidth)).toBe(800)
      assert.deepEqual(backend, [])
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
}

test('optional source preserves text, cancels cleanly and survives draft and read pagination', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview({ width: 900, height: 600 })
  const external = []
  page.on('request', (request) => { if (new URL(request.url()).origin !== BASE) external.push(request.url()) })
  try {
    const input = await writer(page)
    const text = '出处分享测试。\n  保留缩进与空行。\n\n' + '这段摘录需要保留原来的标点和排版。'.repeat(100) + '\n\n'
    await input.fill(text)
    await input.press('Control+Home')
    const trigger = page.getByRole('button', { name: '加出处', exact: true })
    const panel = page.getByRole('dialog', { name: '加出处', exact: true })
    await trigger.click()
    const insert = panel.getByRole('button', { name: '插入正文', exact: true })
    await expect(insert).toBeDisabled()
    await panel.getByLabel('作品与作者', { exact: true }).fill('   ')
    await expect(insert).toBeDisabled()
    await panel.getByLabel('作品与作者', { exact: true }).fill('取消的出处')
    await panel.getByRole('button', { name: '取消', exact: true }).click()
    await expect(panel).toBeHidden()
    await expect(trigger).toBeFocused()
    await expect(input).toHavePaperText(text)
    await trigger.click()
    await expect(panel.getByLabel('作品与作者', { exact: true })).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await trigger.click()
    const title = '《一段摘录》 · 示例作者'
    const location = 'https://example.com/article#page-42'
    await panel.getByLabel('作品与作者', { exact: true }).fill(title)
    await panel.getByLabel('链接或页码', { exact: true }).fill(location)
    await insert.click()
    const expected = `${text}出处：${title} · ${location}`
    await expect(panel).toBeHidden()
    await expect(input).toBeFocused()
    await expect(input).toHavePaperText(expected)
    await expect.poll(() => input.evaluate(async (element) => (await import('/src/lib/paper.js')).paperSelection(element)?.focus)).toBe(expected.length)
    await expect.poll(async () => {
      const [current, total] = (await page.getByLabel('信纸页码').textContent()).split('/').map(Number)
      return current === total && total > 1
    }).toBe(true)
    await expectWholePaper(page)
    await input.press('End')
    await page.keyboard.insertText('，节选')
    const edited = expected + '，节选'
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    await page.reload()
    await expect(await writer(page)).toHavePaperText(edited)
    const writePages = (await page.getByLabel('信纸页码').textContent()).split('/')[1].trim()
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await closeSharedPaper(page)
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await page.getByRole('button', { name: /出处分享测试/ }).click()
    await expect(page.locator('.paper-reading')).toHaveText(edited)
    await expect(page.getByLabel('信纸页码')).toHaveText(`1 / ${writePages}`)
    await expect(page.locator('.paper-reading a')).toHaveCount(0)
    assert.deepEqual(external, [])
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('optional source accepts either field without changing original whitespace', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const input = await writer(page)
    for (const [text, title, location, expected] of [
      ['', '', '第 42 页', '出处：第 42 页'],
      ['  原文  ', '  示例作者  ', '', '  原文  \n\n出处：示例作者'],
      ['原文\n', '', '<img src=x onerror=alert(1)>', '原文\n\n出处：<img src=x onerror=alert(1)>'],
    ]) {
      await input.fill(text)
      await page.getByRole('button', { name: '加出处', exact: true }).click()
      const panel = page.getByRole('dialog', { name: '加出处', exact: true })
      await panel.getByLabel('作品与作者', { exact: true }).fill(title)
      await panel.getByLabel('链接或页码', { exact: true }).fill(location)
      await panel.getByRole('button', { name: '插入正文', exact: true }).click()
      await expect(input).toHavePaperText(expected)
      await expect(page.locator('.paper-mirror img')).toHaveCount(0)
    }
    await input.fill('')
    await expect(page.getByRole('button', { name: '分享给对方', exact: true })).toBeDisabled()
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('sharing stays on the paper and allows the next draft without a ceremony', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  const seals = []
  page.on('request', (request) => { if (request.url().includes('wax-seal')) seals.push(request.url()) })
  try {
    const input = await writer(page)
    await input.fill('第一条即时分享。')
    const pausedAt = new Date()
    await page.clock.install({ time: new Date(pausedAt.getTime() - 60000) })
    await page.clock.pauseAt(pausedAt)
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await expect(page.locator('.letter-status')).toHaveText('对方可以看到了')
    await expect(input).toBeEditable({ timeout: 500 })
    await expect(input).toHavePaperText('')
    await expect(page.getByRole('button', { name: '分享给对方', exact: true })).toBeDisabled()
    await page.clock.runFor(2000)
    await expect(page.getByRole('dialog', { name: '给你看看' })).toBeVisible()
    await input.fill('第二条即时分享。')
    await expect(page.locator('.letter-status')).not.toContainText('对方可以看到了')
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await closeSharedPaper(page)
    await page.clock.resume()
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await expect(page.getByRole('button', { name: /第一条即时分享/ })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /第二条即时分享/ })).toHaveCount(1)
    assert.deepEqual(seals, [])
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('confirmed sharing keeps the cleanup warning visible and can close immediately', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const input = await writer(page)
    await input.fill('清理失败也只分享一次。')
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    await page.evaluate(() => { IDBObjectStore.prototype.delete = function () { throw new Error('模拟本地清理失败') } })
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await expect(page.locator('.letter-status')).toContainText('已分享，但本机旧草稿清理失败')
    await expect(page.locator('.letter-status')).not.toContainText('尚未确认分享成功')
    await expect(input).toBeEditable({ timeout: 500 })
    await expect(page.getByRole('button', { name: '分享给对方', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '关闭信纸' }).click({ timeout: 500 })
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await expect(page.getByRole('button', { name: /清理失败也只分享一次/ })).toHaveCount(1)
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`calendar respects ${reducedMotion} for markers and expanding content`, { timeout: 30000 }, async () => {
    const { context, page, backend, errors } = await preview()
    try {
      await page.emulateMedia({ reducedMotion })
      await page.reload()
      await page.evaluate(() => document.fonts.ready)
      const markers = await page.evaluate(async () => {
        document.querySelector('button[aria-label^="台历，"]').click()
        const frames = []
        for (let i = 0; i < 24; i++) {
          await new Promise(requestAnimationFrame)
          const dot = document.querySelector('dialog button[aria-label*="条内容"] span')
          if (dot) frames.push(new DOMMatrixReadOnly(getComputedStyle(dot).transform).a)
        }
        return frames
      })
      const heights = await page.evaluate(async () => {
        const day = new Date().toLocaleDateString('en-CA')
        document.querySelector(`dialog button[aria-label^="${day}，"]`).click()
        const frames = []
        for (let i = 0; i < 24; i++) {
          await new Promise(requestAnimationFrame)
          const list = document.querySelector('dialog section > .overflow-hidden')
          if (list) frames.push(list.getBoundingClientRect().height)
        }
        return frames
      })
      assert.ok(markers.length > 2)
      assert.ok(heights.length > 2)
      assert.ok(heights.at(-1) > 0)
      if (reducedMotion === 'reduce') {
        assert.ok(markers.slice(2).every((scale) => scale === 1), JSON.stringify({ markers, heights }))
        assert.equal(new Set(heights).size, 1, JSON.stringify(heights))
      } else {
        assert.ok(new Set(markers).size > 1)
        assert.ok(new Set(heights).size > 1)
      }
      const day = new Date().toLocaleDateString('en-CA')
      await page.locator(`dialog button[aria-label^="${day}，"]`).click()
      await expect(page.locator('dialog section > .overflow-hidden')).toHaveCount(0)
      assert.deepEqual(backend, [])
      assert.deepEqual(errors, [])
    } finally { await context.close() }
  })
}

test('narrow desktop preview asks for space and restores full pages without losing the draft', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview({ width: 316, height: 490 })
  try {
    await page.getByRole('button', { name: '给你看看' }).click()
    await expect(page.getByText('把窗口放大些，再铺开这张纸。')).toBeVisible()
    await expect(page.locator('.paper-window')).toBeHidden()
    await page.setViewportSize({ width: 1366, height: 768 })
    const input = page.getByRole('textbox', { name: '分享正文' })
    await expect(input).toBeEnabled()
    await expect(page.getByRole('button', { name: '关闭信纸' })).toBeFocused()
    const text = '正文应该铺满整页。'.repeat(100)
    await input.fill(text)
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 316, height: 490 })
    await expect(page.getByText('把窗口放大些，再铺开这张纸。')).toBeVisible()
    await page.setViewportSize({ width: 900, height: 600 })
    await expect(input).toHavePaperText(text)
    await expect.poll(() => page.locator('.paper-window').evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual(288)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 316, height: 490 })
    await page.getByRole('button', { name: '查看内容', exact: true }).click()
    await expect(page.getByText('把窗口放大些，再铺开这张纸。')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '台历，2 条未读内容' })).toBeVisible()
    await page.getByRole('button', { name: '查看内容', exact: true }).click()
    await page.setViewportSize({ width: 1366, height: 768 })
    await expect(page.locator('.paper-reading')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '台历，1 条未读内容' })).toBeVisible()
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('long letters read as full pages with side arrows and no envelope or scrolling', { timeout: 60000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const input = await writer(page)
    const text = '整页阅读测试。\n' + '窗外的树影落在桌上，寻常的日子也值得慢慢记住。'.repeat(220) + '\n\n最后一行。'
    await input.fill(text)
    await page.evaluate(() => document.fonts.ready)
    const writeHeight = await page.locator('.paper-mirror').evaluate((element) => element.clientHeight)
    const writePages = (await page.getByLabel('信纸页码').textContent()).split('/')[1].trim()
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await closeSharedPaper(page)
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await page.getByRole('button', { name: /整页阅读测试/ }).click()
    await expect(page.locator('.paper-reading')).toHaveText(text)
    await expect(page.locator('.paper-reading')).toHaveCSS('font-family', /^"LXGW WenKai"/)
    await expect(page.getByLabel('信纸页码')).toHaveText(`1 / ${writePages}`)
    assert.equal(await page.locator('.paper-mirror').evaluate((element) => element.clientHeight), writeHeight)
    const next = page.getByRole('button', { name: '下一页', exact: true })
    for (let current = 2; current <= Number(writePages); current++) {
      await next.click()
      await expect(page.getByLabel('信纸页码')).toHaveText(`${current} / ${writePages}`)
      assert.equal(await page.locator('.paper-reading').evaluate((element) => Math.abs(new DOMMatrixReadOnly(getComputedStyle(element).transform).m42)), (current - 1) * await page.locator('.paper-window').evaluate((element) => element.clientHeight))
    }
    await expect(next).toBeDisabled()
    await page.getByRole('button', { name: '上一页', exact: true }).press('PageUp')
    await expect(page.getByLabel('信纸页码')).toHaveText(`${Number(writePages) - 1} / ${writePages}`)
    await page.mouse.move(683, 384)
    await page.mouse.wheel(0, 900)
    assert.deepEqual(await page.locator('.paper-window, .paper-body, .desk-modal').evaluateAll((elements) => elements.map((element) => element.scrollTop)), [0, 0, 0])
    await expect(page.locator('img[src*="envelope-"]')).toHaveCount(0)
    await expect(page.locator('.paper-reading')).toHaveText(text)
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

const ME = '11111111-1111-1111-1111-111111111111'
const YOU = '22222222-2222-2222-2222-222222222222'
const PAIR = '33333333-3333-3333-3333-333333333333'

async function live() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await context.newPage()
  const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', user_metadata: { nickname: '测试' } }
  const state = { letters: [], reactions: [], reactionReplies: 0, requests: [], sockets: [], errors: [], unexpected: [], inserts: 0, reject: false, loseResponse: false, obscure: false, profileError: false }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await context.routeWebSocket('**', (socket) => socket.onMessage((message) => state.sockets.push(String(message))))
  await page.route('**/*.supabase.co/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    state.requests.push({ path: url.pathname, method, body: request.postDataJSON() })
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/token') {
      if (state.authGate) await state.authGate
      if (state.authNetworkError) return route.abort('failed')
      if (state.authError) return route.fulfill({ status: state.authError.status, contentType: 'application/json', headers: { 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' }, body: JSON.stringify(state.authError.body) })
      return reply({ access_token: token, refresh_token: 'local-test-only', token_type: 'bearer', expires_in: 3600, user })
    }
    if (url.pathname === '/auth/v1/user') return reply(user)
    if (url.pathname === '/rest/v1/profiles') {
      if (state.profileError) return reply({ message: '资料读取暂时失败', code: 'XX000' }, 500)
      return reply([{ id: url.searchParams.get('id')?.slice(3), nickname: '测试' }])
    }
    if (url.pathname === '/rest/v1/pairs') return reply([{ id: PAIR, user_a: ME, user_b: YOU, status: 'paired', invite_code: 'TEST1234' }])
    if (url.pathname === '/rest/v1/reactions') {
      const response = state.reactionError ? { message: '回应读取暂时失败', code: 'XX000' } : state.reactions
      const status = state.reactionError ? 500 : 200
      if (state.reactionGate) await state.reactionGate
      await reply(response, status)
      state.reactionReplies++
      return
    }
    if (url.pathname === '/rest/v1/rpc/mark_letter_read') {
      if (state.readError) return reply({ message: '已读保存暂时失败', code: 'XX000' }, 500)
      const letter = state.letters.find((item) => item.id === request.postDataJSON().letter_id)
      if (letter) letter.status = 'read'
      return reply(null)
    }
    if (url.pathname === '/rest/v1/letters') {
      if (method === 'POST') {
        state.inserts++
        if (state.reject) return reply({ message: '写入被明确拒绝', code: '42501' }, 403)
        const letter = { ...request.postDataJSON(), sealed_at: new Date().toISOString() }
        state.letters.push(letter)
        if (state.loseResponse) { state.obscure = true; return route.abort('failed') }
        return reply(letter, 201)
      }
      const id = url.searchParams.get('id')?.slice(3)
      if (id && state.obscure) return route.abort('failed')
      if (state.letterError) return reply({ message: '正文读取暂时失败', code: 'XX000' }, 500)
      return reply(id ? state.letters.filter((letter) => letter.id === id) : state.letters)
    }
    state.unexpected.push(url.pathname)
    return reply({ message: '未模拟的请求' }, 500)
  })
  await page.goto(BASE)
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: ME, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'test'].join('.')
  const login = async (choice = '先不听') => {
    await page.evaluate(async (accessToken) => {
      const { supabase } = await import('/src/lib/supabase.js')
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: 'local-test-only' })
      if (error) throw error
    }, token)
    await dismissBgmPrompt(page, choice)
  }
  return { context, page, state, login }
}

async function dismissBgmPrompt(page, choice) {
  const prompt = page.getByRole('dialog', { name: '背景音乐', exact: true })
  const elsewhere = page.locator('[role="alert"], h2:has-text("与对方配对"), h2:has-text("设置新密码")').first()
  await Promise.race([prompt.waitFor({ timeout: 10000 }), elsewhere.waitFor({ timeout: 10000 })]).catch(() => {})
  if (await prompt.isVisible()) await prompt.getByRole('button', { name: choice, exact: true }).click()
}

const PHOTO = { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V8AAAAASUVORK5CYII=', 'base64') }

async function mockPhotoStorage(page, conflict) {
  const storage = { objects: new Map(), uploads: [], downloads: [], corrupt: false, readDenied: false, ready: true }
  await page.route('**/*.supabase.co/rest/v1/rpc/private_letter_images_ready', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(storage.ready) }))
  await page.route('**/*.supabase.co/storage/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.split('/letter-images/')[1]
    assert.ok(path)
    if (request.method() === 'POST') {
      storage.uploads.push(path)
      assert.equal(request.headers()['x-upsert'], 'false')
      if (storage.uploads.length === 2) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SlowDown', message: '第二张照片暂时上传失败' }) })
      if (storage.objects.has(path)) return route.fulfill({ status: conflict.status, contentType: 'application/json', body: JSON.stringify(conflict.body) })
      const form = await new Response(request.postDataBuffer(), { headers: { 'content-type': request.headers()['content-type'] } }).formData()
      storage.objects.set(path, Buffer.from(await form.get('').arrayBuffer()))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ Id: path, Key: `letter-images/${path}` }) })
    }
    assert.equal(request.method(), 'GET')
    storage.downloads.push(path)
    if (storage.readDenied) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'AccessDenied', message: '照片读取被拒绝' }) })
    assert.ok(storage.objects.has(path))
    return route.fulfill({ contentType: 'image/png', body: storage.corrupt ? Buffer.from('different photo') : storage.objects.get(path) })
  })
  return storage
}

for (const conflict of [
  { name: 'KeyAlreadyExists', status: 409, body: { code: 'KeyAlreadyExists', message: 'The resource already exists' } },
  { name: 'ResourceAlreadyExists', status: 409, body: { code: 'ResourceAlreadyExists', message: 'The resource already exists' } },
  { name: 'already_exists', status: 409, body: { code: 'already_exists', message: 'The resource already exists' } },
  { name: 'HTTP 409', status: 409, body: { message: 'The resource already exists' } },
  { name: 'legacy Duplicate', status: 400, body: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } },
  { name: 'legacy HTTP 400', status: 400, body: { statusCode: '400', error: 'Duplicate', message: 'The resource already exists' } },
  { name: 'Asset Already Exists', status: 400, body: { message: 'Asset Already Exists' } },
]) {
  test(`photo retry handles ${conflict.name} without overwriting or duplicating a share`, { timeout: 30000 }, async () => {
    const { context, page, state, login } = await live()
    const storage = await mockPhotoStorage(page, conflict)
    try {
      await login()
      const input = await writer(page)
      await input.fill('两张照片失败后仍能继续分享。')
      await page.getByLabel('选择照片').setInputFiles([PHOTO, { ...PHOTO, name: 'second.png' }])
      await expect(page.getByRole('img', { name: '附件 2', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '分享给对方', exact: true }).click()
      await expect(page.locator('.letter-status')).toContainText('第二张照片暂时上传失败')
      await expect(input).toBeEditable()
      assert.equal(storage.objects.size, 1)
      assert.equal(state.inserts, 0)
      await page.reload()
      await expect(await writer(page)).toHavePaperText('两张照片失败后仍能继续分享。')
      await expect(page.getByRole('img', { name: '附件 2', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '分享给对方', exact: true }).dblclick()
      await closeSharedPaper(page)
      assert.deepEqual(storage.uploads.slice(2), storage.uploads.slice(0, 2))
      assert.deepEqual(storage.downloads, [storage.uploads[0]])
      assert.equal(storage.objects.size, 2)
      assert.equal(state.inserts, 1)
      assert.equal(state.letters.length, 1)
      assert.deepEqual(state.letters[0].images, [...storage.objects.keys()])
      assert.deepEqual(state.unexpected, [])
      assert.deepEqual(state.errors, [])
    } finally { await context.close() }
  })
}

for (const reason of ['hash mismatch', 'download denied', 'upload forbidden', 'unrelated bad request']) {
  test(`photo retry refuses ${reason} and preserves the draft`, { timeout: 30000 }, async () => {
    const { context, page, state, login } = await live()
    const conflict = reason === 'upload forbidden'
      ? { status: 403, body: { code: 'AccessDenied', message: '上传被拒绝' } }
      : reason === 'unrelated bad request'
        ? { status: 400, body: { code: 'InvalidRequest', message: '无效上传请求' } }
        : { status: 409, body: { code: 'KeyAlreadyExists', message: 'The resource already exists' } }
    const storage = await mockPhotoStorage(page, conflict)
    try {
      await login()
      const input = await writer(page)
      await input.fill('失败时不要丢掉正文和照片。')
      await page.getByLabel('选择照片').setInputFiles([PHOTO, { ...PHOTO, name: 'second.png' }])
      await page.getByRole('button', { name: '分享给对方', exact: true }).click()
      await expect(page.locator('.letter-status')).toContainText('第二张照片暂时上传失败')
      storage.corrupt = reason === 'hash mismatch'
      storage.readDenied = reason === 'download denied'
      await page.getByRole('button', { name: '分享给对方', exact: true }).click()
      await expect(page.locator('.letter-status')).toContainText(conflict.body.message)
      await expect(input).toBeEditable()
      await expect(input).toHavePaperText('失败时不要丢掉正文和照片。')
      await expect(page.getByRole('img', { name: '附件 2', exact: true })).toBeVisible()
      assert.equal(storage.uploads.length, 3)
      assert.deepEqual(storage.downloads, storage.corrupt || storage.readDenied ? [storage.uploads[0]] : [])
      assert.equal(storage.objects.size, 1)
      assert.equal(state.inserts, 0)
      assert.deepEqual(state.unexpected, [])
      assert.deepEqual(state.errors, [])
    } finally { await context.close() }
  })
}

test('photo sharing stops before upload when private storage is not ready', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  const storage = await mockPhotoStorage(page, { status: 409, body: { code: 'KeyAlreadyExists' } })
  storage.ready = false
  try {
    await login()
    const input = await writer(page)
    await input.fill('私密存储未就绪时不上传。')
    await page.getByLabel('选择照片').setInputFiles(PHOTO)
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await expect(page.locator('.letter-status')).toContainText('私有照片存储尚未就绪')
    await expect(input).toBeEditable()
    await expect(input).toHavePaperText('私密存储未就绪时不上传。')
    await expect(page.getByRole('img', { name: '附件 1', exact: true })).toBeVisible()
    assert.deepEqual(storage.uploads, [])
    assert.equal(state.inserts, 0)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('live send rejects safely and confirms a lost response without duplicate insertion', { timeout: 60000 }, async () => {
  const { context, page, state, login } = await live()
  try {
    await login()
    const input = await writer(page)
    await input.fill('  不要丢掉这封信的空格。\n\n')
    state.reject = true
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await expect(page.locator('.letter-status')).toContainText('写入被明确拒绝')
    await expect(input).toBeEditable()
    await input.fill('  修改后再寄出。\n\n')
    state.reject = false
    state.loseResponse = true
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await expect(page.getByRole('button', { name: '确认上次分享' })).toBeVisible({ timeout: 25000 })
    await expect(input).not.toBeEditable()
    await expect(input).toHavePaperText('  修改后再寄出。\n\n')
    await page.reload()
    const restored = await writer(page)
    await expect(restored).not.toBeEditable()
    await expect(restored).toHavePaperText('  修改后再寄出。\n\n')
    state.obscure = false
    await page.getByRole('button', { name: '确认上次分享' }).dblclick()
    await closeSharedPaper(page)
    assert.equal(state.inserts, 2)
    assert.equal(state.letters.length, 1)
    assert.equal(state.letters[0].content, '  修改后再寄出。\n\n')
    await expect(await writer(page)).toHavePaperText('')
    assert.equal(state.requests.some(({ path }) => /pigeon|summon/.test(path)), false)
    assert.equal(state.sockets.some((message) => /pigeon|summon/.test(message)), false)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('opening an unread letter immediately shows paper even if marking read fails', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  try {
    state.readError = true
    state.letters.push({ id: '44444444-4444-4444-4444-444444444444', pair_id: PAIR, sender_id: YOU, status: 'delivered', stationery: 'cream', content: '直接展开，不等拆封。', images: [], sealed_at: new Date().toISOString() })
    await login()
    await page.getByRole('button', { name: '台历，1 条未读内容', exact: true }).click()
    await page.getByRole('button', { name: /直接展开，不等拆封/ }).click()
    await expect(page.locator('.paper-reading')).toHaveText('直接展开，不等拆封。', { timeout: 1000 })
    await expect(page.getByText(/已读状态未保存/)).toBeVisible()
    assert.equal(state.requests.filter((item) => item.path === '/rest/v1/rpc/mark_letter_read').length, 1)
    state.readError = false
    await page.getByRole('button', { name: '重试保存' }).click()
    await expect(page.getByText(/已读状态未保存/)).toBeHidden()
    assert.equal(state.requests.filter((item) => item.path === '/rest/v1/rpc/mark_letter_read').length, 2)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: '台历', exact: true })).toBeVisible()
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('reaction failure never hides content and retries only reactions', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  try {
    const id = '44444444-4444-4444-4444-444444444444'
    state.letters.push({ id, pair_id: PAIR, sender_id: YOU, status: 'delivered', stationery: 'cream', content: '回应失败也能看这段内容。', images: [], sealed_at: new Date().toISOString() })
    state.reactionError = true
    await login()
    await page.getByRole('button', { name: '台历，1 条未读内容', exact: true }).click()
    await page.getByRole('button', { name: /回应失败也能看这段内容/ }).click()
    await expect(page.locator('.paper-reading')).toHaveText('回应失败也能看这段内容。')
    await page.getByRole('button', { name: '留个回应' }).click()
    await expect(page.getByText('回应暂时没有加载出来，可以重试；不影响阅读正文。')).toBeVisible()
    await expect(page.getByRole('button', { name: '送出回应', exact: true })).toHaveCount(0)
    const letterRequests = state.requests.filter(({ path }) => path === '/rest/v1/letters').length
    state.reactionError = false
    state.reactions = [{ letter_id: id, emoji: 'heart', note: '之前的回应' }]
    await page.getByRole('button', { name: '重试读取回应' }).click()
    await expectReaction(page, '喜欢', '之前的回应')
    assert.equal(state.requests.filter(({ path }) => path === '/rest/v1/letters').length, letterRequests)
    await expect(page.getByRole('button', { name: '重试读取回应' })).toHaveCount(0)
    state.reactionError = true
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('button', { name: '重试读取回应' })).toBeVisible()
    await expectReaction(page, '喜欢', '之前的回应')
    await page.keyboard.press('Escape')
    await expect(page.locator('.paper-reading')).toHaveText('回应失败也能看这段内容。')
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('slow reactions do not delay content and stale results cannot replace a newer response', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  let release
  try {
    const id = '44444444-4444-4444-4444-444444444444'
    state.letters.push({ id, pair_id: PAIR, sender_id: YOU, status: 'delivered', stationery: 'cream', content: '不用等回应，正文先显示。', images: [], sealed_at: new Date().toISOString() })
    state.reactionGate = new Promise((resolve) => { release = resolve })
    await login()
    await page.getByRole('button', { name: '台历，1 条未读内容', exact: true }).click()
    await page.getByRole('button', { name: /不用等回应/ }).click()
    await expect(page.locator('.paper-reading')).toHaveText('不用等回应，正文先显示。')
    await page.getByRole('button', { name: '留个回应' }).click()
    await expect(page.getByText('正在读取回应…', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '送出回应', exact: true })).toHaveCount(0)
    assert.equal(state.reactionReplies, 0)
    state.reactionGate = null
    state.reactions = [{ letter_id: id, emoji: 'heart', note: '最新回应' }]
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expectReaction(page, '喜欢', '最新回应')
    const completed = state.reactionReplies
    release()
    await expect.poll(() => state.reactionReplies).toBeGreaterThan(completed)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expectReaction(page, '喜欢', '最新回应')
    await expect(page.getByRole('button', { name: '送出回应', exact: true })).toHaveCount(0)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { release?.(); await context.close() }
})

test('successful reactions do not clear a content loading failure', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  try {
    state.letterError = true
    await login()
    await expect.poll(() => state.reactionReplies).toBeGreaterThan(0)
    await expect(page.getByText(/内容未能同步：正文读取暂时失败/)).toBeVisible()
    state.letterError = false
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await expect(page.getByText(/内容未能同步/)).toHaveCount(0)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('entry prompt starts background music and the speaker mutes from the beginning', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  try {
    await page.evaluate(() => {
      window.__bgm = { plays: 0, element: null }
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () { window.__bgm.plays++; window.__bgm.element = this; return play.call(this) }
    })
    const audio = () => page.evaluate(() => {
      const el = window.__bgm.element
      return { plays: window.__bgm.plays, src: el ? new URL(el.src).pathname : null, loop: el?.loop ?? null, paused: el?.paused ?? null, time: el?.currentTime ?? null }
    })
    await login('播放')
    await expect(page.getByRole('dialog', { name: '背景音乐', exact: true })).toHaveCount(0)
    await expect.poll(async () => (await audio()).paused).toBe(false)
    assert.deepEqual(await audio().then(({ plays, src, loop }) => ({ plays, src, loop })), { plays: 1, src: '/bgm.mp3', loop: true })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const speaker = page.getByRole('button', { name: '静音背景音乐', exact: true })
    await expect(speaker).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await audio()).time).toBeGreaterThan(0)
    await speaker.click()
    await expect(page.getByRole('button', { name: '播放背景音乐', exact: true })).toHaveAttribute('aria-pressed', 'false')
    assert.deepEqual(await audio().then(({ paused, time }) => ({ paused, time })), { paused: true, time: 0 })
    await page.getByRole('button', { name: '播放背景音乐', exact: true }).click()
    await expect(page.getByRole('button', { name: '静音背景音乐', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await audio()).paused).toBe(false)
    const resumed = await audio()
    assert.equal(resumed.plays, 2)
    assert.ok(resumed.time < 1)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('valid recovery saves the new password before returning home', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  try {
    await login()
    await page.goto(`${BASE}/?recovery=1`)
    await expect(page.getByRole('heading', { name: '设置新密码' })).toBeVisible()
    await page.getByLabel('新密码', { exact: true }).fill('test-password-new')
    await page.getByLabel('确认新密码', { exact: true }).fill('test-password-wrong')
    await page.getByRole('button', { name: '保存新密码' }).click()
    await expect(page.getByText('两次密码不一致')).toBeVisible()
    assert.equal(state.requests.filter((item) => item.method === 'PUT').length, 0)
    await page.getByLabel('确认新密码', { exact: true }).fill('test-password-new')
    await page.getByRole('button', { name: '保存新密码' }).click()
    await expect(page.getByText('新密码已保存')).toBeVisible()
    assert.equal(state.requests.filter((item) => item.path === '/auth/v1/user' && item.method === 'PUT').length, 1)
    await page.getByRole('button', { name: '返回首页', exact: true }).click()
    await expect(page.getByRole('button', { name: '给你看看' })).toBeVisible()
    assert.equal(new URL(page.url()).search, '')
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

for (const stage of ['profile creation', 'profile reread', 'partner nickname']) {
  test(`profile loading times out during ${stage} and can retry`, { timeout: 15000 }, async () => {
    const { context, page, state, login } = await live()
    let release
    let reads = 0
    let stalled = false
    const gate = new Promise((resolve) => { release = resolve })
    const handler = async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const own = url.searchParams.get('id') === `eq.${ME}`
      if (request.method() === 'GET' && own) reads++
      const block = stage === 'profile creation' ? request.method() === 'POST'
        : stage === 'profile reread' ? own && reads > 1
          : !own
      if (block) { stalled = true; await gate }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(stage === 'partner nickname' ? [{ id: ME, nickname: '测试' }] : []) })
    }
    try {
      await page.route('**/rest/v1/profiles?**', handler)
      await page.evaluate(() => {
        const timeout = AbortSignal.timeout.bind(AbortSignal)
        window.profileTimeouts = []
        AbortSignal.timeout = (milliseconds) => { window.profileTimeouts.push(milliseconds); return timeout(Math.min(milliseconds, 1000)) }
      })
      await login()
      await expect.poll(() => stalled).toBe(true)
      await expect(page.getByRole('alert')).toContainText('资料未能同步', { timeout: 4000 })
      assert.ok((await page.evaluate(() => window.profileTimeouts)).includes(20000))
      await page.unroute('**/rest/v1/profiles?**', handler)
      release()
      await page.getByRole('button', { name: '重试', exact: true }).click()
      await expect(page.getByRole('button', { name: '给你看看', exact: true })).toBeVisible()
      assert.deepEqual(state.unexpected, [])
      assert.deepEqual(state.errors, [])
    } finally { release(); await context.close() }
  })
}

test('loaded reading photos survive refresh and resizing until the letter closes', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  let downloads = 0
  try {
    const id = '44444444-4444-4444-4444-444444444444'
    state.letters.push({ id, pair_id: PAIR, sender_id: YOU, status: 'read', stationery: 'cream', content: '照片应该一直可以查看。', images: [`${YOU}/${id}/photo.png`], sealed_at: new Date().toISOString() })
    await page.route('**/storage/v1/**', (route) => {
      downloads++
      return route.fulfill({ contentType: 'image/png', body: PHOTO.buffer })
    })
    await login()
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await page.getByRole('button', { name: /照片应该一直可以查看/ }).click()
    await page.getByRole('button', { name: '查看照片 1', exact: true }).click()
    const image = page.getByRole('img', { name: '放大的照片', exact: true })
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true)
    const url = await image.getAttribute('src')
    const firstDownloads = downloads
    const firstReactions = state.reactionReplies
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => state.reactionReplies).toBeGreaterThan(firstReactions)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(downloads, firstDownloads, 'unchanged photos must not be downloaded and revoked during a content refresh')
    await page.setViewportSize({ width: 899, height: 600 })
    await expect(image).toBeVisible()
    assert.equal(await page.evaluate((src) => fetch(src).then((response) => response.ok, () => false), url), true)
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '查看照片 1', exact: true }).click()
    await expect(image).toHaveAttribute('src', url)
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate((src) => fetch(src).then((response) => response.ok, () => false), url), false)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('reading photos defer in small windows, retry failures and release late downloads', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  let denied = true
  let downloads = 0
  let gate
  let release
  try {
    const id = '44444444-4444-4444-4444-444444444444'
    state.letters.push({ id, pair_id: PAIR, sender_id: YOU, status: 'read', stationery: 'cream', content: '读取失败仍然能看正文。', images: [`${YOU}/${id}/photo.png`], sealed_at: new Date().toISOString() })
    await page.route('**/storage/v1/**', async (route) => {
      downloads++
      if (gate) await gate
      return route.fulfill(denied
        ? { status: 403, contentType: 'application/json', body: JSON.stringify({ message: '照片暂不可用' }) }
        : { contentType: 'image/png', body: PHOTO.buffer })
    })
    await page.setViewportSize({ width: 899, height: 600 })
    await login()
    const open = async (selectDay = true) => {
      await page.getByRole('button', { name: '台历', exact: true }).click()
      const day = new Date().toLocaleDateString('en-CA')
      if (selectDay) await page.locator(`button[aria-label^="${day}，"]`).click()
      await page.getByRole('button', { name: /读取失败仍然能看正文/ }).click()
    }
    await open()
    await expect(page.getByText('把窗口放大些，再铺开这张纸。')).toBeVisible()
    assert.equal(downloads, 0)
    await page.setViewportSize({ width: 1366, height: 900 })
    await expect(page.getByText(/照片读取失败/)).toBeVisible()
    await expect(page.locator('.paper-reading')).toHaveText('读取失败仍然能看正文。')
    denied = false
    await page.getByRole('button', { name: '重新读取照片', exact: true }).click()
    await page.getByRole('button', { name: '查看照片 1', exact: true }).click()
    await expect.poll(() => page.getByRole('img', { name: '放大的照片' }).evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      const create = URL.createObjectURL.bind(URL)
      const revoke = URL.revokeObjectURL.bind(URL)
      window.photoUrls = { created: [], revoked: [] }
      URL.createObjectURL = (blob) => { const url = create(blob); window.photoUrls.created.push(url); return url }
      URL.revokeObjectURL = (url) => { window.photoUrls.revoked.push(url); revoke(url) }
    })
    gate = new Promise((resolve) => { release = resolve })
    const previousDownloads = downloads
    await open(false)
    await expect.poll(() => downloads).toBeGreaterThan(previousDownloads)
    await page.getByRole('button', { name: '关闭信纸', exact: true }).click()
    release()
    await expect.poll(() => page.evaluate(() => window.photoUrls.created.length)).toBeGreaterThan(0)
    await expect.poll(() => page.evaluate(() => window.photoUrls.created.every((url) => window.photoUrls.revoked.includes(url)))).toBe(true)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { release?.(); await context.close() }
})

for (const action of ['create', 'join']) {
  test(`pair ${action} rejects safely then reaches home with mocked HTTP`, { timeout: 30000 }, async () => {
    const { context, page, state, login } = await live()
    let pair = null
    let attempts = 0
    const invite = 'ABC234'
    const handler = async (route) => {
      const request = route.request()
      if (request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(pair ? [pair] : []) })
      attempts++
      const body = request.postDataJSON()
      if (action === 'join') assert.equal(body.code, invite)
      else { assert.equal(body.user_a, ME); assert.match(body.invite_code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/) }
      if (attempts === 1) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: '暂时不能配对', code: 'P0001' }) })
      pair = { id: PAIR, user_a: action === 'create' ? ME : YOU, user_b: action === 'create' ? null : ME, status: action === 'create' ? 'waiting' : 'paired', invite_code: action === 'create' ? body.invite_code : invite }
      return route.fulfill({ contentType: 'application/json', body: 'null' })
    }
    try {
      await page.route('**/rest/v1/pairs**', handler)
      await page.route('**/rest/v1/rpc/join_pair', handler)
      await login()
      await expect(page.getByRole('heading', { name: '与对方配对' })).toBeVisible()
      const submit = page.getByRole('button', { name: action === 'create' ? '创建我们的空间' : '加入', exact: true })
      if (action === 'join') {
        await page.getByPlaceholder('输入对方的邀请码').fill('AB')
        await submit.click()
        await expect(page.getByText('邀请码是 6 位字母数字')).toBeVisible()
        assert.equal(attempts, 0)
        await page.getByPlaceholder('输入对方的邀请码').fill(invite.toLowerCase())
      }
      await submit.click()
      await expect(page.getByText(/暂时不能配对/)).toBeVisible()
      await expect(submit).toBeEnabled()
      await submit.click()
      if (action === 'create') {
        await expect(page.getByRole('heading', { name: '等待配对' })).toBeVisible()
        await expect(page.getByText(pair.invite_code, { exact: true })).toBeVisible()
        pair = { ...pair, user_b: YOU, status: 'paired' }
      }
      await expect(page.getByRole('button', { name: '给你看看', exact: true })).toBeVisible({ timeout: 8000 })
      assert.equal(attempts, 2)
      assert.deepEqual(state.unexpected, [])
      assert.deepEqual(state.errors, [])
    } finally { await context.close() }
  })
}

test('registration validates input and retries rejected signup without real mail', { timeout: 30000 }, async () => {
  const { context, page, state } = await live()
  const signups = []
  try {
    await page.route('**/auth/v1/signup**', (route) => {
      signups.push(route.request().postDataJSON())
      return route.fulfill(signups.length === 1
        ? { status: 400, contentType: 'application/json', body: JSON.stringify({ msg: '注册暂时不可用' }) }
        : { contentType: 'application/json', body: JSON.stringify({ id: ME, email: 'test@example.com', user_metadata: { nickname: '测试' } }) })
    })
    await page.getByRole('button', { name: '去注册', exact: true }).click()
    const submit = page.getByRole('button', { name: '注册', exact: true })
    await page.getByLabel('邮箱', { exact: true }).fill('test@example.com')
    await page.getByLabel('密码', { exact: true }).fill('local-test-password')
    await page.getByLabel('你的昵称', { exact: true }).fill('   ')
    await submit.click()
    await expect(page.getByText('请输入昵称')).toBeVisible()
    assert.equal(signups.length, 0)
    await page.getByLabel('你的昵称', { exact: true }).fill('  测试  ')
    await submit.click()
    await expect(page.getByText('操作未完成，请重试')).toBeVisible()
    await expect(page.getByText('注册暂时不可用', { exact: true })).toHaveCount(0)
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByText('请查收验证邮件，验证后登录。')).toBeVisible()
    await expect(submit).toHaveCount(0)
    assert.equal(signups.length, 2)
    assert.equal(signups[1].data.nickname, '测试')
    await expect(page.getByRole('button', { name: '创建我们的空间' })).toHaveCount(0)
    await page.getByRole('button', { name: '返回登录', exact: true }).click()
    await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
    await expect(page.getByLabel('密码', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue('test@example.com')
    await expect(page.getByText('请查收验证邮件，验证后登录。')).toHaveCount(0)
    await page.getByRole('button', { name: '去注册', exact: true }).click()
    await expect(submit).toBeVisible()
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('profile read failure is retryable and never creates a replacement profile', { timeout: 30000 }, async () => {
  const { context, page, state, login } = await live()
  try {
    state.profileError = true
    await login()
    await expect(page.getByRole('alert')).toContainText('资料未能同步，请重试')
    assert.equal(state.requests.some((item) => item.path === '/rest/v1/profiles' && item.method !== 'GET'), false)
    state.profileError = false
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await expect(page.getByRole('button', { name: '给你看看' })).toBeVisible()
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { await context.close() }
})

test('failed local storage keeps the text and never reports it saved or sent', { timeout: 30000 }, async () => {
  const { context, page, backend } = await preview()
  try {
    await page.addInitScript(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('test quota', 'QuotaExceededError') } })
    await page.reload()
    const input = await writer(page)
    await input.fill('存储失败时也要保留正文')
    await expect(page.locator('.letter-status')).toContainText('草稿未保存')
    await page.getByRole('button', { name: '分享给对方', exact: true }).click()
    await expect(page.locator('.letter-status')).toContainText('草稿保存失败')
    await expect(input).toHavePaperText('存储失败时也要保留正文')
    await expect(input).toBeEditable()
    await input.press('Escape')
    await expect(await writer(page)).toHavePaperText('存储失败时也要保留正文')
    assert.deepEqual(backend, [])
  } finally { await context.close() }
})

test('draft save warnings remain visible beside validation errors and clear only after saving', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview({ width: 900, height: 600 })
  try {
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put
      window.failDraftSave = true
      IDBObjectStore.prototype.put = function (...args) {
        if (window.failDraftSave) throw new DOMException('test quota', 'QuotaExceededError')
        return put.apply(this, args)
      }
    })
    await page.reload()
    const input = await writer(page)
    const share = page.getByRole('button', { name: '分享给对方', exact: true })
    await expect(share).toBeDisabled()
    await expect(page.getByText(/先写点什么/)).toHaveCount(0)
    await input.fill('这段文字尚未保存')
    await expect(page.getByRole('alert')).toHaveText('草稿未保存，请勿刷新或关闭页面')
    await page.getByLabel('选择照片').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await expect(page.getByText(/请选择 JPG/)).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
    await share.click()
    await expect(page.locator('.letter-status')).toContainText('草稿保存失败')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(input).toHavePaperText('这段文字尚未保存')
    await expect(input).toBeEditable()
    const bounds = await page.locator('.letter-workspace').boundingBox()
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 600)
    await page.evaluate(() => { window.failDraftSave = false })
    await input.fill('现在重新保存这段文字')
    await expect(page.getByText('草稿已保存在这台电脑', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText(/草稿保存失败|请选择 JPG/)).toHaveCount(0)
    await page.reload()
    await expect(await writer(page)).toHavePaperText('现在重新保存这段文字')
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('light sharing accepts a short text insertion or just a photo without writing prompts', { timeout: 30000 }, async () => {
  const { context, page, backend, errors } = await preview()
  try {
    const input = await writer(page)
    const share = page.getByRole('button', { name: '分享给对方', exact: true })
    await expect(page.locator('.paper-heading')).toContainText('给你看看')
    await expect(share).toBeDisabled()
    await input.fill('  \n')
    await expect(share).toBeDisabled()
    await input.fill('')
    await input.focus()
    const text = '今天看到的一个小知识。\n就这一段。'
    await page.keyboard.insertText(text)
    await expect(input).toHavePaperText(text)
    await expect(share).toBeEnabled()
    await expect(page.getByText(/先写点什么|写一封信/)).toHaveCount(0)
    await share.click()
    await closeSharedPaper(page)
    await page.getByRole('button', { name: '台历', exact: true }).click()
    const day = new Date().toLocaleDateString('en-CA')
    await page.locator(`button[aria-label^="${day}，"]`).click()
    await page.getByRole('button', { name: /今天看到的一个小知识/ }).click()
    await expect(page.locator('.paper-reading')).toHaveText(text)
    await expect(page.locator('.paper-heading')).toContainText('你分享的内容')
    await page.keyboard.press('Escape')
    const emptyInput = await writer(page)
    await expect(emptyInput).toHavePaperText('')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6V8AAAAASUVORK5CYII=', 'base64')
    await page.getByLabel('选择照片').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
    await expect(share).toBeEnabled()
    await expect(emptyInput).toHavePaperText('')
    await page.getByRole('button', { name: '移除附件 1', exact: true }).click()
    await expect(share).toBeDisabled()
    assert.deepEqual(backend, [])
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

for (const failure of [
  { name: 'credentials', status: 400, code: 'invalid_credentials', text: '邮箱或密码错误' },
  { name: 'unconfirmed email', status: 400, code: 'email_not_confirmed', text: '邮箱尚未验证，请查收验证邮件' },
  { name: 'email rate limit', status: 429, code: 'over_email_send_rate_limit', text: '发送过于频繁，请稍后重试' },
  { name: 'unknown rate limit', status: 429, text: '操作过于频繁，请稍后重试' },
  { name: 'service failure', status: 503, text: '服务暂时不可用，请稍后重试' },
  { name: 'unknown error', status: 400, code: 'unrecognized_error', text: '操作未完成，请重试' },
  { name: 'inherited property', status: 400, code: 'constructor', text: '操作未完成，请重试' },
  { name: 'network failure', network: true, text: '网络请求失败，请重试' },
]) {
  test(`login reports ${failure.name} briefly and retries through the form`, { timeout: 30000 }, async () => {
    const { context, page, state } = await live()
    try {
      state.authNetworkError = !!failure.network
      state.authError = { status: failure.status, body: { code: failure.code, msg: 'Internal diagnostic details must stay hidden' } }
      await page.getByLabel('邮箱', { exact: true }).fill('test@example.com')
      await page.getByLabel('密码', { exact: true }).fill('local-test-password')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expect(page.getByRole('status')).toHaveText(failure.text)
      await expect(page.getByText('Internal diagnostic details must stay hidden')).toHaveCount(0)
      await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue('test@example.com')
      await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled()
      state.authError = null
      state.authNetworkError = false
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expect(page.getByRole('button', { name: '给你看看', exact: true })).toBeVisible()
      const requests = state.requests.filter((item) => item.path === '/auth/v1/token')
      assert.equal(requests.length, 2)
      assert.equal(requests[1].body.email, 'test@example.com')
      assert.equal(requests[1].body.password, 'local-test-password')
      assert.deepEqual(state.unexpected, [])
      assert.deepEqual(state.errors, [])
    } finally { await context.close() }
  })
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 900, height: 600 }]) {
  test(`entry pages share the desk background and fit ${viewport.width}x${viewport.height}`, { timeout: 30000 }, async () => {
    const { context, page, state, login } = await live()
    const consoleErrors = []
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    try {
      await page.setViewportSize(viewport)
      await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      assert.match(await page.locator('.entry-page').evaluate((element) => getComputedStyle(element).backgroundImage), /bg-main\.jpg/)
      await expect(page.locator('img[src*="feather"], [class*="sky-"], .feather-float')).toHaveCount(0)
      await expect(page.getByText('把寻常的日子，写给你')).toHaveCount(0)
      const checkCard = async (name) => {
        const box = await page.locator('.entry-card').boundingBox()
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        if (process.env.UI_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.UI_SCREENSHOT_DIR}/entry-${name}-${viewport.width}.png` })
      }
      await checkCard('login')
      await page.getByLabel('邮箱', { exact: true }).focus()
      assert.equal(await page.getByLabel('邮箱', { exact: true }).evaluate((element) => getComputedStyle(element).outlineStyle), 'solid')
      await page.getByLabel('邮箱', { exact: true }).press('Tab')
      await expect(page.getByLabel('密码', { exact: true })).toBeFocused()
      await page.getByRole('button', { name: '去注册', exact: true }).click()
      await checkCard('register')
      await page.getByLabel('你的昵称', { exact: true }).fill('   ')
      await page.getByLabel('邮箱', { exact: true }).fill('test@example.com')
      await page.getByLabel('密码', { exact: true }).fill('local-test-password')
      await page.getByRole('button', { name: '注册', exact: true }).click()
      await expect(page.getByText('请输入昵称')).toBeVisible()
      await checkCard('register-error')
      await page.getByRole('button', { name: '返回登录', exact: true }).click()
      await page.getByRole('button', { name: '忘记密码', exact: true }).click()
      await checkCard('forgot')
      await page.getByRole('button', { name: '返回登录', exact: true }).click()
      await page.route('**/rest/v1/pairs**', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }))
      await login()
      await expect(page.getByRole('heading', { name: '与对方配对', exact: true })).toBeVisible()
      await checkCard('pair')
      await expect(page.locator('[class*="sky-"]')).toHaveCount(0)
      assert.deepEqual(consoleErrors, [])
      assert.deepEqual(state.unexpected, [])
      assert.deepEqual(state.errors, [])
    } finally { await context.close() }
  })
}

test('login prevents repeated submissions while authenticating', { timeout: 30000 }, async () => {
  const { context, page, state } = await live()
  let release
  state.authGate = new Promise((resolve) => { release = resolve })
  try {
    await page.getByLabel('邮箱', { exact: true }).fill('test@example.com')
    await page.getByLabel('密码', { exact: true }).fill('local-test-password')
    await page.getByLabel('密码', { exact: true }).press('Enter')
    await expect.poll(() => state.requests.filter((item) => item.path === '/auth/v1/token').length).toBe(1)
    await expect(page.getByRole('button', { name: '正在登录…', exact: true })).toBeDisabled()
    await expect(page.getByLabel('邮箱', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: '忘记密码', exact: true })).toBeDisabled()
    await page.locator('form').dispatchEvent('submit')
    assert.equal(state.requests.filter((item) => item.path === '/auth/v1/token').length, 1)
    release()
    await expect(page.getByRole('button', { name: '给你看看', exact: true })).toBeVisible()
    assert.equal(state.requests.filter((item) => item.path === '/auth/v1/token').length, 1)
    assert.deepEqual(state.unexpected, [])
    assert.deepEqual(state.errors, [])
  } finally { release(); await context.close() }
})

test('password recovery request and expired link are usable with mocked HTTP only', { timeout: 30000 }, async () => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  const page = await context.newPage()
  const requests = []
  await page.route('**/*.supabase.co/**', (route) => {
    requests.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  try {
    await page.goto(BASE)
    await page.getByRole('button', { name: '忘记密码', exact: true }).click()
    await page.getByLabel('邮箱', { exact: true }).fill('test@example.com')
    await page.getByRole('button', { name: '发送重置邮件', exact: true }).click()
    await expect(page.getByText(/如果该邮箱已注册/)).toBeVisible()
    await expect(page.getByRole('button', { name: '发送重置邮件', exact: true })).toHaveCount(0)
    assert.equal(requests.filter((url) => url.includes('/recover')).length, 1)
    assert.equal(new URL(requests.find((url) => url.includes('/recover'))).searchParams.get('redirect_to'), `${BASE}/?recovery=1`)
    await page.getByRole('button', { name: '重新申请', exact: true }).click()
    await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue('test@example.com')
    await page.getByRole('button', { name: '发送重置邮件', exact: true }).click()
    await expect(page.getByText(/如果该邮箱已注册/)).toBeVisible()
    assert.equal(requests.filter((url) => url.includes('/recover')).length, 2)
    await page.getByRole('button', { name: '返回登录', exact: true }).click()
    await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
    await page.goto(`${BASE}/?recovery=1`)
    await expect(page.getByText(/重置链接已失效/)).toBeVisible()
    await expect(page.getByLabel('新密码', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '重新申请', exact: true }).click()
    await expect(page.getByRole('button', { name: '发送重置邮件', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回登录', exact: true }).click()
    await expect(page.getByRole('heading', { name: '登录', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeEnabled()
    assert.equal(new URL(page.url()).search, '')
  } finally { await context.close() }
})
