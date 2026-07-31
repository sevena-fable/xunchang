// 把 raw-pigeon.jpg 里的主鸽子抠成透明背景 PNG
// 思路：1) 裁出主鸽子区域  2) 从四边泛洪填充，把接近背景色的像素变透明  3) 裁掉多余透明边
const sharp = require('sharp')

async function main() {
  const src = 'raw-pigeon.jpg'
  const meta = await sharp(src).metadata()
  const W = meta.width, H = meta.height
  console.log('原图尺寸:', W, 'x', H)

  // 主鸽子大致在画面上方 75%、水平中间区域（下方是 4 个小姿势和水印）
  const crop = {
    left: Math.round(W * 0.10),
    top: Math.round(H * 0.10),
    width: Math.round(W * 0.82),
    height: Math.round(H * 0.68),
  }

  const { data, info } = await sharp(src)
    .extract(crop)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width, h = info.height, ch = info.channels
  const px = (x, y) => (y * w + x) * ch

  // 取四角的平均色当背景色
  const corners = [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]
  let br = 0, bg = 0, bb = 0
  for (const [x, y] of corners) {
    const i = px(x, y)
    br += data[i]; bg += data[i + 1]; bb += data[i + 2]
  }
  br /= 4; bg /= 4; bb /= 4
  console.log('背景色约为 rgb(', Math.round(br), Math.round(bg), Math.round(bb), ')')

  const TOL = 34        // 与背景色的距离小于它 → 判定为背景
  const SOFT = 22       // 边缘再宽这么多的过渡带 → 半透明，让轮廓柔和
  const dist = (i) => Math.sqrt((data[i] - br) ** 2 + (data[i + 1] - bg) ** 2 + (data[i + 2] - bb) ** 2)

  // 泛洪填充（BFS）：从四条边出发
  const visited = new Uint8Array(w * h)
  const queue = []
  for (let x = 0; x < w; x++) { queue.push(x, 0, x, h - 1) }
  for (let y = 0; y < h; y++) { queue.push(0, y, w - 1, y) }
  while (queue.length) {
    const y = queue.pop(), x = queue.pop()
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const idx = y * w + x
    if (visited[idx]) continue
    visited[idx] = 1
    const i = px(x, y)
    const d = dist(i)
    if (d < TOL) {
      data[i + 3] = 0 // 完全透明
      queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
    } else if (d < TOL + SOFT) {
      data[i + 3] = Math.round(((d - TOL) / SOFT) * 255) // 过渡带半透明
      queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
    }
  }

  // 找到不透明像素的包围盒，裁掉四周纯透明的部分
  let minX = w, minY = h, maxX = 0, maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[px(x, y) + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const pad = 6
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad)
  console.log('鸽子包围盒:', minX, minY, '→', maxX, maxY)

  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toFile('public/pigeon.png')

  console.log('已输出 public/pigeon.png')
}

main().catch((e) => { console.error(e); process.exit(1) })
