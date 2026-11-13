import * as T from 'three'

// Small, seeded batches keep the garden identical in all three camera views.
// Petals and leaves share geometry; adding flowers does not add a draw call per stem.
function random(seed = 3207) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function flowerBatches(parent) {
  const petals = [], leaves = [], stems = [], centers = []
  const up = new T.Vector3(0, 1, 0)
  const transform = new T.Object3D()
  const color = new T.Color()
  function stem(from, to, radius = 0.009) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to)
    stems.push({ p: a.clone().lerp(b, 0.5).toArray(), s: [radius, a.distanceTo(b), radius],
      q: new T.Quaternion().setFromUnitVectors(up, b.sub(a).normalize()) })
  }
  function leaf(x, y, z, size, angle, tint = '#72964f') {
    leaves.push({ p: [x, y, z], s: [size * 0.43, size * 0.15, size],
      r: [0.35, angle, 0.3], c: tint })
  }
  function flower(x, y, z, size, tint, phase = 0, rose = false) {
    const count = rose ? 8 : 6
    const tiers = rose ? 2 : 1
    for (let tier = 0; tier < tiers; tier++) {
      const radius = size * (tier ? 0.28 : 0.57)
      for (let j = 0; j < count; j++) {
        const a = j / count * Math.PI * 2 + phase + tier * 0.4
        petals.push({ p: [x + Math.sin(a) * radius, y + tier * size * 0.25, z + Math.cos(a) * radius],
          s: [size * (rose ? 0.48 : 0.34), size * (rose ? 0.23 : 0.12), size * 0.58],
          r: [rose ? -0.35 : -0.13, a, 0], c: tint })
      }
    }
    centers.push({ p: [x, y + size * 0.16, z], s: [size * 0.22, size * 0.16, size * 0.22],
      c: rose ? '#f1b68c' : '#e4b64b' })
  }
  function flush() {
    function batch(geometry, items, tint) {
      if (!items.length) { geometry.dispose(); return }
      const surface = new T.MeshStandardMaterial({ color: tint, roughness: 0.83 })
      const mesh = new T.InstancedMesh(geometry, surface, items.length)
      items.forEach((item, i) => {
        transform.position.set(...item.p)
        transform.scale.set(...item.s)
        transform.rotation.set(...(item.r || [0, 0, 0]))
        if (item.q) transform.quaternion.copy(item.q)
        transform.updateMatrix()
        mesh.setMatrixAt(i, transform.matrix)
        if (item.c) mesh.setColorAt(i, color.set(item.c))
      })
      mesh.receiveShadow = true
      parent.add(mesh)
    }
    batch(new T.SphereGeometry(1, 8, 6), petals, '#ffffff')
    batch(new T.SphereGeometry(1, 6, 4), leaves, '#ffffff')
    batch(new T.CylinderGeometry(1, 1, 1, 5), stems, '#6c914d')
    batch(new T.IcosahedronGeometry(1, 1), centers, '#ffffff')
  }
  return { stem, leaf, flower, flush }
}

export function addGarden(scene) {
  const rng = random()
  const garden = flowerBatches(scene)
  const palettes = [
    ['#fff2d5', '#f8d6b7', '#f2b9ba'],
    ['#edb1bc', '#f8ced0', '#fff0d8'],
    ['#b6a2cc', '#d6bddb', '#f5e4dc'],
  ]
  // Clear the approach to the door and the mailbox. Larger flowers cluster at
  // the edges of the deck; smaller meadow flowers lead the eye along the path.
  const beds = [
    [-6.0, 3.6, 1.45, 2.1, 70, 0], [-4.7, 7.2, 2.0, 0.85, 85, 1],
    [-1.1, 7.7, 1.35, 0.8, 52, 0], [7.3, 3.3, 1.0, 2.4, 82, 1],
    [7.2, 8.7, 0.8, 1.4, 48, 2], [-0.1, 10.9, 1.4, 1.6, 52, 1],
    [8.4, -2.8, 1.3, 2.0, 45, 2], [-6.4, -2.1, 1.2, 1.9, 45, 0],
  ]
  for (const [cx, cz, rx, rz, count, palette] of beds) {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, distance = Math.sqrt(rng())
      const x = cx + Math.cos(a) * rx * distance
      const z = cz + Math.sin(a) * rz * distance
      const h = 0.28 + rng() * 0.48
      const lean = (rng() - 0.5) * 0.14
      const size = 0.075 + rng() * 0.055
      const tint = palettes[palette][i % 3]
      garden.stem([x, -0.03, z], [x + lean, h, z], 0.007)
      garden.leaf(x - 0.05, h * 0.4, z, 0.14, a)
      garden.leaf(x + 0.06, h * 0.65, z, 0.11, a + 2.1, '#8ca75b')
      garden.flower(x + lean, h, z, size, tint, a, palette === 1 && i % 3 === 0)
      if (palette === 2 && i % 2 === 0) {
        for (let j = 1; j < 4; j++) {
          garden.flower(x + lean, h + j * 0.085, z, size * (1 - j * 0.16), tint, a + j)
        }
      }
    }
  }
  // A climbing rose follows the left porch post, away from the entrance hot spot.
  for (let i = 0; i < 32; i++) {
    const y = 0.3 + i * 0.076
    const x = -4.82 + Math.sin(i * 0.57) * 0.17
    garden.stem([x, y, 3.9], [-4.82 + Math.sin((i + 1) * 0.57) * 0.17, y + 0.076, 3.9], 0.015)
    garden.leaf(x, y, 4.01, 0.16, i * 1.7)
    if (i % 3 === 0) garden.flower(x + 0.1, y + 0.07, 4.08, 0.11, '#f5bdc5', i, true)
  }
  garden.flush()
}

export function addWindowDetails(inside) {
  const linen = new T.MeshStandardMaterial({ color: '#fff3dc', roughness: 1, side: T.DoubleSide })
  const brass = new T.MeshStandardMaterial({ color: '#b69b64', roughness: 0.48, metalness: 0.45 })
  const rod = new T.Mesh(new T.CylinderGeometry(0.023, 0.023, 4.6, 8), brass)
  rod.rotation.z = Math.PI / 2
  rod.position.set(1.62, 3.2, -3.48)
  inside.add(rod)
  for (const x of [-0.42, 3.66]) {
    const geometry = new T.PlaneGeometry(0.62, 2.27, 18, 24)
    const positions = geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i) / 0.62 + 0.5
      const y = positions.getY(i)
      const gather = 0.6 + 0.4 * Math.min(1, Math.abs(y + 0.42) / 1.3)
      positions.setXYZ(i, positions.getX(i) * gather, y, Math.cos(u * Math.PI * 10) * 0.045 + Math.sin(y * 2) * 0.025)
    }
    geometry.computeVertexNormals()
    const curtain = new T.Mesh(geometry, linen)
    curtain.position.set(x, 2.0, -3.46)
    curtain.receiveShadow = true
    inside.add(curtain)
  }
  // One small vase beside the writing area, with room for the paper and calendar.
  const ceramic = new T.MeshStandardMaterial({ color: '#f1d2b7', roughness: 0.45 })
  const vase = new T.Mesh(new T.LatheGeometry([
    new T.Vector2(0.07, 0), new T.Vector2(0.10, 0.06), new T.Vector2(0.09, 0.15),
    new T.Vector2(0.045, 0.23), new T.Vector2(0.045, 0.26),
  ], 14), ceramic)
  vase.position.set(2.02, 0.91, -3.04)
  vase.castShadow = vase.receiveShadow = true
  inside.add(vase)
  const bouquet = flowerBatches(inside)
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4, x = 2.02 + Math.sin(a) * 0.12, z = -3.04 + Math.cos(a) * 0.09
    const y = 1.35 + (i % 3) * 0.065
    bouquet.stem([2.02, 1.14, -3.04], [x, y, z], 0.005)
    bouquet.leaf(x, y - 0.1, z, 0.06, a)
    bouquet.flower(x, y, z, 0.057, i % 2 ? '#fff0d7' : '#edb7bf', a)
  }
  bouquet.flush()
}
