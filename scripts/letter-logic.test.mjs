import test from 'node:test'
import assert from 'node:assert/strict'
import { pageMetrics } from '../src/lib/paper.js'
import { draftKey } from '../src/lib/drafts.js'
import { imagePath, validateAttachments } from '../src/lib/letterImages.js'
import { dayKey } from '../src/lib/letterFormat.js'

const owner = '11111111-1111-1111-1111-111111111111'
const origin = 'https://project.supabase.co'

test('whole-line pages preserve an extra last line', () => {
  assert.deepEqual(pageMetrics(360, 365), { pageHeight: 360, count: 1 })
  assert.deepEqual(pageMetrics(396, 365), { pageHeight: 360, count: 2 })
  assert.deepEqual(pageMetrics(0, 0), { pageHeight: 36, count: 1 })
})
test('draft keys isolate environment, account and pair', () => {
  assert.notEqual(draftKey('live', owner, 'p'), draftKey('preview', owner, 'p'))
  assert.notEqual(draftKey('live', owner, 'p'), draftKey('live', 'other', 'p'))
  assert.notEqual(draftKey('live', owner, 'p'), draftKey('live', owner, 'q'))
})
test('only own-project legacy URLs become storage paths', () => {
  const path = `${owner}/photo.jpg`
  assert.equal(imagePath(path, origin), path)
  assert.equal(imagePath(`${origin}/storage/v1/object/public/letter-images/${path}`, origin), path)
  for (const value of [`https://other.example/storage/v1/object/public/letter-images/${path}`, `${owner}/../x.jpg`, `${owner}//x.jpg`, `javascript:alert(1)`, `${owner}/x.jpg?x=1`, `${origin}/storage/v1/object/public/letter-images/${path}?download=1`]) assert.throws(() => imagePath(value, origin))
})
test('unsafe or oversized attachments rejected', () => {
  assert.doesNotThrow(() => validateAttachments([{ file: { type: 'image/png', size: 100 } }]))
  assert.throws(() => validateAttachments([{ file: { type: 'image/svg+xml', size: 100 } }]))
  assert.throws(() => validateAttachments([{ file: { type: 'image/png', size: 6291457 } }]))
  assert.throws(() => validateAttachments(Array(4).fill({ file: { type: 'image/png', size: 100 } })))
})
test('calendar groups by local date', () => {
  assert.equal(dayKey(new Date(2026, 8, 22, 0, 1).toISOString()), '2026-09-22')
})
