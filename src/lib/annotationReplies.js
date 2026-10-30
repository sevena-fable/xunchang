import { validateAnnotations } from './annotations.js'

export function validateReply(content, reply) {
  validateAnnotations(content, [reply])
}

// Split by text offsets rather than stacking translucent bands. Every overlap has
// one deliberate lavender fill, regardless of painting order or number of notes.
export function annotationSegments(annotations = [], replies = []) {
  const events = new Map()
  const add = (position, kind, delta) => {
    const counts = events.get(position) || { author: 0, reply: 0 }
    counts[kind] += delta
    events.set(position, counts)
  }
  for (const [items, kind] of [[annotations, 'author'], [replies, 'reply']]) {
    for (const item of items) {
      add(item.start, kind, 1)
      add(item.end, kind, -1)
    }
  }
  const points = [...events.keys()].sort((a, b) => a - b)
  const result = []
  let author = 0, reply = 0
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index], end = points[index + 1]
    author += events.get(start).author
    reply += events.get(start).reply
    if (!author && !reply) continue
    const tone = author && reply ? 'overlap' : author ? 'author' : 'reply'
    const previous = result.at(-1)
    if (tone === 'overlap' && previous?.tone === tone && previous.end === start) previous.end = end
    else result.push({ start, end, tone })
  }
  return result
}

export function sameReply(left, right) {
  return ['id', 'letter_id', 'pair_id', 'user_id', 'start', 'end', 'quote', 'note'].every((key) => left[key] === right[key])
}
