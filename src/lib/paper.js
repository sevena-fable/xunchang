export const LINE_HEIGHT = 36

function paperDocument(root) {
  let text = ''
  const points = [[root, 0]]
  const offsets = new Map()
  const isBlock = (node) => node.nodeType === 1 && /^(DIV|P)$/.test(node.tagName)

  function walk(element) {
    const children = Array.from(element.childNodes)
    const boundaries = []
    offsets.set(element, boundaries)
    let previousBlock = false
    let started = false
    const last = element === root || isBlock(element) ? children.findLast((node) => node.nodeType !== 3 || node.length > 0) : null
    for (const [index, node] of children.entries()) {
      const block = isBlock(node)
      const meaningful = node.nodeType !== 3 || node.length > 0
      if (meaningful && started && (block || previousBlock) && (previousBlock || !text.endsWith('\n'))) {
        text += '\n'
        points[text.length] = [element, index]
      }
      boundaries[index] = text.length
      if (node.nodeType === 3) {
        // Blink ends an editable line with a non-content newline to keep the caret visible.
        const value = node === last && node.data.endsWith('\n') ? node.data.slice(0, -1) : node.data
        const start = text.length
        offsets.set(node, Array.from({ length: node.length + 1 }, (_, offset) => start + Math.min(offset, value.length)))
        for (let offset = 0; offset <= value.length; offset++) points[start + offset] = [node, offset]
        text += value
      } else if (node.nodeName === 'BR') {
        offsets.set(node, [text.length])
        points[text.length] = [element, index]
        if (node !== last) {
          text += '\n'
          points[text.length] = [element, index + 1]
        }
      } else if (node.nodeType === 1) {
        walk(node)
      }
      if (meaningful) { started = true; previousBlock = block }
    }
    boundaries[children.length] = text.length
  }
  walk(root)
  return { text, points, offsets }
}

export function readPaperText(root) {
  return paperDocument(root).text
}

export function writePaperText(root, text) {
  const document = root.ownerDocument
  root.replaceChildren(...(text ? text.split('\n').map((line) => {
    const paragraph = document.createElement('div')
    paragraph.append(line ? document.createTextNode(line) : document.createElement('br'))
    return paragraph
  }) : []))
}

export function paperSelection(root, editable = true) {
  const selection = root.ownerDocument.getSelection()
  if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null
  if (!editable) {
    const prefix = root.ownerDocument.createRange()
    prefix.selectNodeContents(root)
    prefix.setEnd(selection.anchorNode, selection.anchorOffset)
    const anchor = prefix.toString().length
    prefix.setEnd(selection.focusNode, selection.focusOffset)
    return { anchor, focus: prefix.toString().length }
  }
  const { offsets } = paperDocument(root)
  return { anchor: offsets.get(selection.anchorNode)[selection.anchorOffset], focus: offsets.get(selection.focusNode)[selection.focusOffset] }
}

export function selectPaperText(root, anchor, focus = anchor) {
  const { text, points } = paperDocument(root)
  const start = points[Math.max(0, Math.min(anchor, text.length))]
  const end = points[Math.max(0, Math.min(focus, text.length))]
  root.ownerDocument.getSelection().setBaseAndExtent(...start, ...end)
}

export function paperInputRange(root, range) {
  if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  const { offsets } = paperDocument(root)
  return { anchor: offsets.get(range.startContainer)[range.startOffset], focus: offsets.get(range.endContainer)[range.endOffset] }
}

export function paperTextRects(root, start, end, editable) {
  if (!root || start >= end) return []
  const offsets = editable ? paperDocument(root).offsets : null
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const rects = []
  let node
  let position = 0
  while ((node = walker.nextNode())) {
    const from = offsets ? offsets.get(node)[0] : position
    const to = offsets ? offsets.get(node).at(-1) : position + node.length
    position = to
    if (from >= end || to <= start) continue
    const range = root.ownerDocument.createRange()
    range.setStart(node, Math.max(0, start - from))
    range.setEnd(node, Math.min(to - from, end - from))
    rects.push(...Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0))
  }
  return rects
}

export function pageMetrics(totalHeight, availableHeight) {
  const lines = Math.max(1, Math.floor(availableHeight / LINE_HEIGHT))
  const pageHeight = lines * LINE_HEIGHT
  return { pageHeight, count: Math.max(1, Math.ceil(totalHeight / pageHeight)) }
}

export function offsetTop(mirror, offset) {
  const text = mirror.firstChild
  if (!text) return 0
  const start = Math.min(Math.max(0, offset), text.length - 1)
  const range = document.createRange()
  range.setStart(text, start)
  range.setEnd(text, start + 1)
  const rect = range.getClientRects()[0]
  return rect ? Math.max(0, Math.round((rect.top - mirror.getBoundingClientRect().top) / LINE_HEIGHT) * LINE_HEIGHT) : 0
}

export function pageStart(mirror, content, page, pageHeight) {
  const offsets = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(content), (part) => part.index)
  offsets.push(content.length)
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (offsetTop(mirror, offsets[mid]) < page * pageHeight) low = mid + 1
    else high = mid
  }
  return offsets[low]
}
