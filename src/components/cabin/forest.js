import * as T from 'three'

function foliageTexture(random) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  ctx.lineCap = 'round'
  for (let branch = 0; branch < 3; branch++) {
    const angle = -0.65 + branch * 0.65 + (random() - 0.5) * 0.3
    ctx.save()
    ctx.translate(128, 218)
    ctx.rotate(angle)
    ctx.strokeStyle = '#665d34'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(12, -60, 3, -170)
    ctx.stroke()
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1
      ctx.save()
      ctx.translate(4 + side * (9 + random() * 6), -18 - i * 15)
      ctx.rotate(side * (0.65 + random() * 0.45))
      const gradient = ctx.createLinearGradient(-10, 0, 10, 0)
      gradient.addColorStop(0, '#648b3b')
      gradient.addColorStop(0.48, ['#bdd77c', '#a9c665', '#d0df91'][i % 3])
      gradient.addColorStop(1, '#86a750')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(0, 5)
      ctx.bezierCurveTo(-11, -4, -10, -17, 0, -24)
      ctx.bezierCurveTo(10, -17, 11, -4, 0, 5)
      ctx.fill()
      ctx.strokeStyle = '#d4c98260'
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(0, 4)
      ctx.lineTo(0, -22)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  }
  const texture = new T.CanvasTexture(canvas)
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function addForest(scene, treePoints, shrubs, bark, random) {
  const branches = []
  const foliage = []
  const up = new T.Vector3(0, 1, 0)
  function branch(start, end, radius) {
    const a = new T.Vector3(...start)
    const b = new T.Vector3(...end)
    branches.push({
      position: a.clone().lerp(b, 0.5),
      rotation: new T.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()),
      scale: new T.Vector3(radius * 2, a.distanceTo(b), radius * 2),
    })
  }
  function cluster(x, y, z, radius, count) {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2
      const distance = Math.sqrt(random()) * radius
      const size = radius * (0.8 + random() * 0.55)
      foliage.push({
        position: new T.Vector3(x + Math.cos(angle) * distance, y + (random() - 0.5) * radius, z + Math.sin(angle) * distance),
        rotation: new T.Quaternion().setFromEuler(new T.Euler(-0.7 + random() * 2.2, angle, random())),
        scale: new T.Vector3(size, size, size),
      })
    }
  }
  for (const [x, z, height] of treePoints) {
    const lean = (random() - 0.5) * 1.1
    const radius = height * (0.019 + random() * 0.009)
    branch([x, -0.05, z], [x + lean * 0.3, height * 0.46, z], radius)
    branch([x + lean * 0.3, height * 0.46, z], [x + lean, height * 0.89, z + 0.35], radius * 0.65)
    const distant = Math.hypot(x, z) > 40
    const branchCount = distant ? 10 : 22
    for (let i = 0; i < branchCount; i++) {
      const angle = i * 2.399 + random() * 0.45
      const level = 0.49 + i / (branchCount * 2.3)
      const length = height * (0.12 + random() * 0.1) * (1.3 - level * 0.6)
      const start = [x + lean * level, height * level, z]
      const end = [start[0] + Math.cos(angle) * length, start[1] + length * 0.48, z + Math.sin(angle) * length]
      branch(start, end, radius * (1 - level) * 0.36)
      for (const side of [-1, 1]) {
        const twig = [end[0] + Math.cos(angle + side * 0.7) * length * 0.5, end[1] + length * 0.15, end[2] + Math.sin(angle + side * 0.7) * length * 0.5]
        branch(end, twig, radius * 0.08)
        cluster(...twig, length * 0.52, distant ? 4 : 6)
      }
    }
    cluster(x + lean, height * 0.93, z, height * 0.08, 8)
  }
  for (const { p, s } of shrubs) cluster(p[0], p[1] + s[1] * 0.3, p[2], s[0] * 1.2, 9)
  const transform = new T.Object3D()
  function batch(geometry, material, items) {
    const mesh = new T.InstancedMesh(geometry, material, items.length)
    items.forEach((item, index) => {
      transform.position.copy(item.position)
      transform.quaternion.copy(item.rotation)
      transform.scale.copy(item.scale)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }
  batch(new T.CylinderGeometry(0.28, 0.5, 1, 9, 2), bark, branches)
  const leaves = new T.MeshStandardMaterial({
    color: '#c5d6ac', map: foliageTexture(random), roughness: 0.94,
    emissive: '#48652e', emissiveIntensity: 0.025,
    alphaTest: 0.45, side: T.DoubleSide,
  })
  const crown = batch(new T.PlaneGeometry(1, 1), leaves, foliage)
  foliage.forEach((_, index) => crown.setColorAt(index, new T.Color().setHSL(0.19 + random() * 0.055, 0.2, 0.79 + random() * 0.19)))
}
