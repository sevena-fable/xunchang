import test from 'node:test'
import assert from 'node:assert/strict'
import { pageMetrics } from '../src/lib/paper.js'
import { draftKey } from '../src/lib/drafts.js'
import { imagePath, validateAttachments } from '../src/lib/letterImages.js'
import { dayKey } from '../src/lib/letterFormat.js'
import { annotationSelection, characterCount, characterOffset, domOffset, moveAnnotations, sameAnnotations, validateAnnotations } from '../src/lib/annotations.js'

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

const annotation = { id: owner, start: 1, end: 4, quote: '🐦é', note: '注' }
const annotatedText = '甲🐦é乙'

test('annotations count code points and map both selection directions', () => {
  assert.equal(characterCount('🐦é'), 3)
  assert.equal(characterOffset(annotatedText, 5), 4)
  assert.equal(domOffset(annotatedText, 4), 5)
  for (const selection of [{ anchor: 1, focus: 5 }, { anchor: 5, focus: 1 }]) {
    assert.deepEqual(annotationSelection(annotatedText, selection), { start: 1, end: 4, quote: '🐦é' })
  }
  assert.equal(annotationSelection(' \n', { anchor: 0, focus: 2 }), null)
  assert.equal(annotationSelection(annotatedText, { anchor: 1, focus: 2 }), null)
  for (let offset = 0; offset <= characterCount(annotatedText); offset++) assert.equal(characterOffset(annotatedText, domOffset(annotatedText, offset)), offset)
})

test('annotation validation accepts long notes but rejects invalid structure and overlap', () => {
  for (const note of ['v', '🐦'.repeat(100), '🐦'.repeat(101), 'é'.repeat(5000), '长批注\n'.repeat(10000)]) assert.doesNotThrow(() => validateAnnotations(annotatedText, [{ ...annotation, note }]))
  assert.doesNotThrow(() => validateAnnotations('', []))
  const invalid = [null, {}, [null], [{ ...annotation, id: 'wrong' }], [{ ...annotation, start: -1 }], [{ ...annotation, start: 1.5 }], [{ ...annotation, end: 90 }], [{ ...annotation, end: 1 }], [{ ...annotation, quote: 'wrong' }], [annotation, annotation]]
  for (const note of ['', ' \n\t\v\f\r\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff', 100, null]) invalid.push([{ ...annotation, note }])
  for (const field of ['id', 'start', 'end', 'quote', 'note']) {
    const item = { ...annotation }; delete item[field]; invalid.push([item])
  }
  for (const items of invalid) assert.throws(() => validateAnnotations(annotatedText, items))
  assert.equal(sameAnnotations([annotation], [{ ...annotation }]), true)
  assert.equal(sameAnnotations(undefined, []), true)
  for (const field of ['id', 'start', 'end', 'quote', 'note']) assert.equal(sameAnnotations([annotation], [{ ...annotation, [field]: 'different' }]), false)
})

test('annotation ranges move on exact edits without adopting repeated text', () => {
  const item = { id: owner, start: 2, end: 5, quote: 'abc', note: '注' }
  const cases = [
    ['01Xabc67', { start: 2, end: 2 }, 3, 6, 'abc'],
    ['01abcX67', { start: 5, end: 5 }, 2, 5, 'abc'],
    ['01aXbc67', { start: 3, end: 3 }, 2, 6, 'aXbc'],
    ['1abc67', { start: 0, end: 1 }, 1, 4, 'abc'],
    ['01ac67', { start: 3, end: 4 }, 2, 4, 'ac'],
    ['0Xbc67', { start: 1, end: 3 }, 2, 4, 'bc'],
    ['01abX7', { start: 4, end: 6 }, 2, 4, 'ab'],
  ]
  for (const [after, hint, start, end, quote] of cases) {
    const next = moveAnnotations('01abc67', after, [item], hint)
    assert.deepEqual(next, [{ ...item, start, end, quote }])
    assert.doesNotThrow(() => validateAnnotations(after, next))
  }
  assert.deepEqual(moveAnnotations('01abc67', '01XYZ67', [item], { start: 2, end: 5 }), [])
  assert.deepEqual(moveAnnotations('01abc67', '0167', [item], { start: 2, end: 5 }), [])
  const repeated = { ...item, start: 2, end: 3, quote: '甲' }
  assert.deepEqual(moveAnnotations('甲甲甲甲', '甲甲甲', [repeated], { start: 0, end: 1 }), [{ ...repeated, start: 1, end: 2 }])
  assert.deepEqual(moveAnnotations('甲甲甲甲', '甲甲甲', [repeated], { start: 2, end: 3 }), [])
  assert.deepEqual(moveAnnotations('甲甲甲甲', '甲甲甲', [repeated]), [])
})


test('reply highlights split partial, nested and equal overlaps without painting order differences', async () => {
  const { annotationSegments, validateReply } = await import('../src/lib/annotationReplies.js')
  const author = [{ start: 2, end: 8 }]
  const replies = [{ start: 5, end: 10 }, { start: 6, end: 7 }]
  assert.deepEqual(annotationSegments(author, replies), [
    { start: 2, end: 5, tone: 'author' }, { start: 5, end: 8, tone: 'overlap' }, { start: 8, end: 10, tone: 'reply' },
  ])
  assert.deepEqual(annotationSegments(author, replies.toReversed()), annotationSegments(author, replies))
  assert.deepEqual(annotationSegments([{ start: 0, end: 1 }, { start: 1, end: 2 }]), [{ start: 0, end: 1, tone: 'author' }, { start: 1, end: 2, tone: 'author' }])
  assert.deepEqual(annotationSegments(author, author), [{ start: 2, end: 8, tone: 'overlap' }])
  assert.deepEqual(annotationSegments(author, [{ start: 8, end: 10 }]), [{ start: 2, end: 8, tone: 'author' }, { start: 8, end: 10, tone: 'reply' }])
  assert.doesNotThrow(() => validateReply(annotatedText, { ...annotation, note: '阅读者的长回复'.repeat(200) }))
  assert.throws(() => validateReply(annotatedText, { ...annotation, quote: '错位的原文' }))
})
