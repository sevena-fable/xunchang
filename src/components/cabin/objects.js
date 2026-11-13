import * as T from 'three'

const material = (color, options = {}) => new T.MeshStandardMaterial({ color, roughness: 0.85, ...options })

function mesh(parent, geometry, surface, x, y, z, sx = 1, sy = 1, sz = 1) {
  const object = new T.Mesh(geometry, surface)
  object.position.set(x, y, z)
  object.scale.set(sx, sy, sz)
  object.receiveShadow = true
  parent.add(object)
  return object
}

export function makeTurntable(parent) {
  const player = new T.Group()
  player.position.set(0.94, 0.56, -0.22)
  parent.add(player)
  const box = new T.BoxGeometry(1, 1, 1)
  const body = material('#513724')
  const trim = material('#231e19')
  const rubber = material('#242522', { roughness: 0.64 })
  const grooves = material('#1b1d1b', { roughness: 0.52 })
  const metal = material('#c2afa0', { metalness: 0.6, roughness: 0.38 })
  const label = material('#a55d45')
  const mark = material('#ecd2a0')
  const lightMaterial = material('#6f3524', { emissive: '#ffb14c', emissiveIntensity: 0 })
  const cylinder = new T.CylinderGeometry(1, 1, 1, 36)
  mesh(player, box, trim, 0, 0.005, 0, 0.62, 0.035, 0.49)
  mesh(player, box, body, 0, 0.044, 0, 0.63, 0.066, 0.5)
  mesh(player, cylinder, metal, -0.065, 0.083, 0, 0.214, 0.023, 0.214)
  const disc = new T.Group()
  disc.position.set(-0.065, 0.098, 0)
  player.add(disc)
  mesh(disc, cylinder, rubber, 0, 0, 0, 0.206, 0.011, 0.206)
  for (const radius of [0.086, 0.117, 0.146, 0.178, 0.197]) {
    const ring = new T.RingGeometry(radius, radius + 0.0025, 40)
    mesh(disc, ring, grooves, 0, 0.006, 0).rotation.x = -Math.PI / 2
  }
  mesh(disc, cylinder, label, 0, 0.007, 0, 0.073, 0.003, 0.073)
  mesh(disc, box, mark, 0.027, 0.009, 0.015, 0.038, 0.002, 0.01)
  mesh(player, cylinder, metal, -0.065, 0.112, 0, 0.01, 0.031, 0.01)
  mesh(player, cylinder, metal, 0.22, 0.1, -0.16, 0.052, 0.071, 0.052)
  mesh(player, cylinder, metal, 0.23, 0.092, 0.174, 0.029, 0.023, 0.029)
  mesh(player, cylinder, lightMaterial, 0.165, 0.083, 0.174, 0.012, 0.007, 0.012)
  const arm = new T.Group()
  arm.position.set(0.22, 0.146, -0.16)
  player.add(arm)
  mesh(arm, box, metal, 0, 0, 0.123, 0.018, 0.017, 0.26)
  mesh(arm, box, trim, 0, -0.01, 0.261, 0.039, 0.033, 0.051)
  return { arm, disc, lightMaterial }
}

export function makePigeon(parent) {
  const bird = new T.Group()
  const feathers = material('#9a9f9c')
  const flights = material('#68777c')
  const neck = material('#5b796d')
  const eyes = material('#2c2c25')
  const beak = material('#ab8d72')
  const shape = new T.SphereGeometry(1, 12, 8)
  parent.add(bird)
  mesh(bird, shape, feathers, 0, 0.22, 0, 0.13, 0.16, 0.245)
  mesh(bird, shape, neck, 0, 0.31, 0.145, 0.102, 0.15, 0.1)
  mesh(bird, shape, feathers, 0, 0.423, 0.173, 0.095, 0.095, 0.103)
  mesh(bird, new T.ConeGeometry(0.031, 0.103, 8), beak, 0, 0.409, 0.28).rotation.x = Math.PI / 2
  for (const side of [-1, 1]) {
    mesh(bird, shape, eyes, side * 0.077, 0.445, 0.222, 0.017, 0.015, 0.017)
    mesh(bird, shape, beak, side * 0.047, 0.041, 0.03, 0.018, 0.053, 0.017)
    mesh(bird, shape, beak, side * 0.047, 0.009, 0.063, 0.023, 0.01, 0.048)
  }
  const tail = mesh(bird, shape, flights, 0, 0.21, -0.26, 0.083, 0.04, 0.18)
  tail.rotation.x = 0.18
  const wings = [-1, 1].map((side) => {
    const wing = new T.Group()
    wing.position.set(side * 0.096, 0.27, -0.014)
    bird.add(wing)
    mesh(wing, shape, flights, side * 0.138, 0, -0.045, 0.163, 0.035, 0.147)
    mesh(wing, shape, feathers, side * 0.255, 0, -0.103, 0.147, 0.025, 0.092)
    return { wing, side }
  })
  return { bird, wings }
}
