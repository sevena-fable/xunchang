export const ANNOTATION_LIMIT = 100
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/

export const characterCount = (text) => Array.from(text).length
export const characterOffset = (text, offset) => characterCount(text.slice(0, offset))
export const domOffset = (text, offset) => Array.from(text).slice(0, offset).join('').length

export function validateAnnotations(content, annotations) {
  if (!Array.isArray(annotations)) throw new Error('批注格式不正确')
  const characters = Array.from(content)
  const ids = new Set()
  let end = 0
  for (const item of annotations) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || !ID.test(item.id) || ids.has(item.id)
      || !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end) || item.start < end || item.start >= item.end || item.end > characters.length
      || typeof item.quote !== 'string' || !item.quote.trim() || item.quote !== characters.slice(item.start, item.end).join('')
      || typeof item.note !== 'string' || !item.note.trim() || characterCount(item.note) > ANNOTATION_LIMIT) {
      throw new Error('批注需对应有效且不重叠的原文，每条限 100 字')
    }
    ids.add(item.id)
    end = item.end
  }
}

export function sameAnnotations(left = [], right = []) {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index]
    return ['id', 'start', 'end', 'quote', 'note'].every((key) => item[key] === other[key])
  })
}

export function annotationSelection(content, selection) {
  const from = Math.min(selection.anchor, selection.focus)
  const to = Math.max(selection.anchor, selection.focus)
  const start = characterOffset(content, from)
  const end = characterOffset(content, to)
  const quote = content.slice(from, to)
  if (!quote.trim() || domOffset(content, start) !== from || domOffset(content, end) !== to) return null
  return { start, end, quote }
}

export function textReplacement(before, after, hint) {
  const old = Array.from(before)
  const next = Array.from(after)
  if (hint) {
    const { start, end } = hint
    const inserted = next.length - old.length + end - start
    if (start >= 0 && end >= start && end <= old.length && inserted >= 0
      && old.slice(0, start).join('') === next.slice(0, start).join('')
      && old.slice(end).join('') === next.slice(start + inserted).join('')) return { start, end, inserted }
  }
  let prefix = 0
  let suffix = 0
  while (prefix < Math.min(old.length, next.length) && old[prefix] === next[prefix]) prefix++
  while (suffix < Math.min(old.length, next.length) && old[old.length - suffix - 1] === next[next.length - suffix - 1]) suffix++
  // Include every equivalent edit position when repeated text makes an unanchored edit ambiguous.
  const start = Math.min(prefix, old.length - suffix)
  const end = Math.max(prefix, old.length - suffix)
  return { start, end, inserted: next.length - old.length + end - start }
}

export function moveAnnotations(before, after, annotations, hint) {
  if (before === after && (!hint || hint.start === hint.end)) return annotations
  const edit = textReplacement(before, after, hint)
  const delta = edit.inserted - (edit.end - edit.start)
  const characters = Array.from(after)
  return annotations.flatMap((item) => {
    let { start, end } = item
    if (edit.end <= start) { start += delta; end += delta }
    else if (edit.start < end) {
      if (edit.start <= start && edit.end >= end) return []
      start = edit.start < start ? edit.start + edit.inserted : start
      end = edit.end > end ? edit.start : end + delta
    }
    const quote = characters.slice(start, end).join('')
    return start < end && quote.trim() ? [{ ...item, start, end, quote }] : []
  })
}
