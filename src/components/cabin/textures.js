import * as T from 'three'

export function fabricWeave() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')
  context.fillStyle = '#9d9d9d'
  context.fillRect(0, 0, 128, 128)
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 32; col++) {
      context.fillStyle = (row + col) % 2 ? '#c2c2c2' : '#707070'
      context.fillRect(col * 4, row * 4, 3, 2)
    }
  }
  const map = new T.CanvasTexture(canvas)
  map.wrapS = map.wrapT = T.RepeatWrapping
  map.repeat.set(12, 12)
  map.anisotropy = 4
  return map
}
