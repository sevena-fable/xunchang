import * as T from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { makePigeon, makeTurntable } from './objects'
import { cabinMaterials } from './materials'
import { addForest } from './forest'
import { fabricWeave } from './textures'

export const targets = {
  door: { center: [2.55, 1.4, 3.83], size: [1.7, 2.46, 0.15] },
  mailbox: { center: [5.85, 1.53, 6.45], size: [0.86, 0.52, 0.66] },
  desk: { center: [1.65, 1.08, -2.4], size: [2.44, 0.32, 1.22] },
  paper: { center: [1.7, 0.93, -2.32], size: [0.94, 0.025, 0.63] },
  calendar: { center: [0.77, 1.18, -2.65], size: [0.46, 0.38, 0.17] },
  turntable: { center: [2.59, 1.01, -2.82], size: [0.64, 0.14, 0.51] },
}

export const views = {
  outside: { from: [12.8, 7.7, 16.4], to: [0.45, 1.65, 0.5] },
  inside: { from: [3.44, 1.99, 2.75], to: [-0.58, 1.25, -2.25] },
  desk: { from: [1.64, 1.72, -1.02], to: [1.65, 1.00, -3.05] },
}

function random(seed = 824) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

const material = (color, options = {}) => new T.MeshStandardMaterial({ color, roughness: 0.88, ...options })

export function createCabin(onMaterialsLoaded) {
  const scene = new T.Scene()
  scene.background = new T.Color('#d6e0cf')
  scene.fog = new T.FogExp2('#c1cfb6', 0.025)
  const rng = random()
  const surfaces = cabinMaterials(onMaterialsLoaded)
  const wood = (color) => {
    const timber = surfaces.timber.clone()
    timber.color.set(color)
    return timber
  }
  const mat = {
    grass: surfaces.earth, path: material('#918572'), stone: material('#888574'),
    trim: wood('#837060'), wood: wood('#c6a077'), edge: wood('#e0be95'),
    floor: wood('#ddc7a5'), roof: material('#454d4b'),
    glass: material('#c5d7ca', { opacity: 0.10, transparent: true, depthWrite: false, side: T.DoubleSide, roughness: 0.28 }),
    rug: material('#9c7459'), fabric: material('#d9c7aa'), pillow: material('#697b58'),
    dark: material('#353b33'), paper: material('#f4e4c2'), ink: material('#554a37'),
    lamp: material('#ffd391', { emissive: '#ffab56', emissiveIntensity: 0.95 }),
  }
  const weave = fabricWeave()
  for (const fabric of [mat.fabric, mat.pillow, mat.rug]) {
    fabric.bumpMap = weave
    fabric.bumpScale = 0.008
  }
  const cubes = new T.BoxGeometry(1, 1, 1)
  const sphere = new T.IcosahedronGeometry(1, 1)
  function mesh(parent, geometry, surface, position, scale, shadow = true) {
    const object = new T.Mesh(geometry, surface)
    object.position.set(...position)
    object.scale.set(...scale)
    object.castShadow = shadow
    object.receiveShadow = true
    parent.add(object)
    return object
  }
  const box = (parent, surface, x, y, z, w, h, d, shadow = true) =>
    mesh(parent, cubes, surface, [x, y, z], [w, h, d], shadow)
  function group(parent, x = 0, y = 0, z = 0) {
    const object = new T.Group()
    object.position.set(x, y, z)
    parent.add(object)
    return object
  }
  function beam(parent, surface, from, to, width) {
    const a = new T.Vector3(...from)
    const b = new T.Vector3(...to)
    const object = mesh(parent, cubes, surface, a.clone().lerp(b, 0.5).toArray(), [width, a.distanceTo(b), width])
    object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.sub(a).normalize())
    return object
  }

  const sky = new T.HemisphereLight('#dce9ee', '#847959', 1.75)
  scene.add(sky)
  const sun = new T.DirectionalLight('#fff0d4', 3.45)
  sun.position.set(-5, 15, 9)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.5, far: 45 })
  sun.shadow.normalBias = 0.018
  sun.shadow.bias = -0.0002
  scene.add(sun)
  const fill = new T.DirectionalLight('#e4ebe3', 0.52)
  fill.position.set(2, 6, -10)
  scene.add(fill)

  box(scene, mat.grass, 0, -0.28, 0, 135, 0.42, 135, false)
  const path = new T.Shape()
  path.moveTo(1.55, 5.8)
  path.bezierCurveTo(1.65, 8.5, 4, 9, 3.1, 18)
  path.lineTo(6.5, 18)
  path.bezierCurveTo(6.8, 10, 3.8, 8.5, 3.7, 5.8)
  path.closePath()
  const trail = new T.Mesh(new T.ShapeGeometry(path), mat.path)
  trail.rotation.x = Math.PI / 2
  trail.material.side = T.DoubleSide
  trail.position.y = -0.056
  trail.receiveShadow = true
  scene.add(trail)

  const house = group(scene)
  const planks = ['#c1a07c', '#c7a984', '#b99570', '#be9a73', '#cba983'].map(wood)
  box(house, mat.trim, 0, 0.03, 0, 9.75, 0.27, 7.7)
  box(house, mat.floor, 0, 0.23, 0, 9.5, 0.16, 7.45)
  box(house, mat.trim, 0, 0.05, 4.85, 10.7, 0.24, 2.65)
  for (let i = 0; i < 36; i++) {
    box(house, planks[i % 5], -5.17 + i * 0.295, 0.21, 4.86, 0.283, 0.12, 2.68)
  }
  box(house, mat.edge, 2.57, 0.07, 6.43, 2.35, 0.23, 0.51)
  for (let i = 0; i < 25; i++) {
    box(house, planks[i % 5], -4.62 + i * 0.385, 0.319, 0, 0.376, 0.018, 7.38, false)
  }

  function siding(x1, x2, low, high, z) {
    const columns = Math.ceil((x2 - x1) / 0.25)
    const width = (x2 - x1) / columns
    for (let i = 0; i < columns; i++) {
      box(house, planks[i % 5], x1 + (i + 0.5) * width, (low + high) / 2, z, width - 0.009, high - low, 0.19)
    }
  }
  function windowFrame(x1, x2, low, high, z, divisions = 2) {
    const width = x2 - x1
    const x = (x1 + x2) / 2
    const y = (low + high) / 2
    box(house, mat.glass, x, y, z, width, high - low, 0.025, false)
    for (let i = 0; i <= divisions; i++) {
      box(house, mat.dark, x1 + i * width / divisions, y, z, 0.092, high - low, 0.12)
    }
    for (const height of [low, high]) box(house, mat.dark, x, height, z, width + 0.1, 0.09, 0.13)
  }
  siding(-4.75, -3.85, 0.3, 3.55, 3.7)
  siding(3.85, 4.75, 0.3, 3.55, 3.7)
  siding(-3.85, 3.85, 3.22, 3.55, 3.7)
  siding(-3.85, 1.62, 0.3, 0.63, 3.7)
  siding(3.44, 3.85, 0.3, 0.63, 3.7)
  windowFrame(-3.85, 1.62, 0.63, 3.22, 3.7, 3)
  windowFrame(3.44, 3.85, 0.63, 3.22, 3.7, 1)
  for (const x of [1.62, 3.44]) box(house, mat.trim, x, 1.77, 3.7, 0.12, 2.93, 0.2)

  const door = group(house, 1.68, 0.35, 3.72)
  box(door, mat.glass, 0.85, 1.41, 0, 1.67, 2.8, 0.045, false)
  for (const x of [0, 1.71]) box(door, mat.dark, x, 1.41, 0, 0.11, 2.83, 0.12)
  for (const y of [0, 2.82]) box(door, mat.dark, 0.85, y, 0, 1.78, 0.105, 0.12)
  box(door, mat.edge, 1.53, 1.26, 0.095, 0.052, 0.3, 0.13)

  siding(-4.75, -0.62, 0.3, 3.55, -3.7)
  siding(3.85, 4.75, 0.3, 3.55, -3.7)
  siding(-0.62, 3.85, 0.3, 0.77, -3.7)
  siding(-0.62, 3.85, 3.12, 3.55, -3.7)
  windowFrame(-0.62, 3.85, 0.77, 3.12, -3.7, 3)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const z = -3.62 + i * 0.249
      if (side > 0 && z > -2.5 && z < 0.15) {
        box(house, planks[i % 5], side * 4.76, 0.62, z, 0.19, 0.65, 0.24)
        box(house, planks[i % 5], side * 4.76, 3.22, z, 0.19, 0.67, 0.24)
      } else {
        box(house, planks[i % 5], side * 4.76, 1.925, z, 0.19, 3.25, 0.24)
      }
    }
    box(house, mat.trim, side * 4.78, 3.52, 0, 0.22, 0.18, 8.1)
  }
  const sideWindow = group(house, 4.76, 0, -1.17)
  sideWindow.rotation.y = Math.PI / 2
  box(sideWindow, mat.glass, 0, 1.93, 0, 2.59, 1.95, 0.025, false)
  for (const x of [-1.31, 0, 1.31]) box(sideWindow, mat.dark, x, 1.93, 0, 0.08, 1.98, 0.12)
  for (const y of [0.96, 2.91]) box(sideWindow, mat.dark, 0, y, 0, 2.67, 0.09, 0.12)

  const slope = Math.atan2(2.82, 5.3)
  const roofWidth = Math.hypot(5.3, 2.82)
  const roofColors = ['#444b48', '#484f4b', '#424945', '#4b514d'].map((color) => material(color))
  const ceiling = wood('#c09568')
  for (const side of [-1, 1]) {
    const roof = group(house, 0, 6.18, 0)
    roof.rotation.z = -side * slope
    box(roof, mat.roof, side * roofWidth / 2, 0, 0, roofWidth, 0.23, 8.65)
    for (let row = 0; row < 23; row++) {
      for (let tile = 0; tile < 21; tile++) {
        const z = -4.12 + tile * 0.41 + (row % 2) * 0.06
        box(roof, roofColors[Math.floor(rng() * 4)], side * (row + 0.5) * roofWidth / 23, 0.139, z,
          roofWidth / 23 - 0.009, 0.032 + (tile % 3) * 0.003, 0.402)
      }
    }
    for (let i = 0; i < 28; i++) {
      box(roof, ceiling, side * roofWidth / 2, -0.126, -3.645 + i * 0.27, roofWidth, 0.042, 0.263, false)
    }
    for (const z of [-3.5, -1.75, 0, 1.75, 3.5]) {
      box(roof, mat.wood, side * roofWidth / 2, -0.234, z, roofWidth, 0.18, 0.16)
    }
    for (const z of [-4.37, 4.37]) box(roof, mat.edge, side * roofWidth / 2, -0.08, z, roofWidth + 0.04, 0.25, 0.18)
  }
  for (const z of [-3.72, 3.72]) {
    const triangle = new T.Shape()
    triangle.moveTo(-4.74, 3.5)
    triangle.lineTo(0, 6.08)
    triangle.lineTo(4.74, 3.5)
    triangle.closePath()
    const gable = new T.Mesh(new T.ShapeGeometry(triangle), z > 0 ? mat.glass : material('#95643d', { side: T.DoubleSide }))
    gable.position.z = z
    house.add(gable)
    for (const x of [-4.74, 4.74]) beam(house, mat.edge, [0, 6.08, z], [x, 3.5, z], 0.16)
    beam(house, mat.trim, [0, 3.49, z], [0, 6.09, z], 0.16)
    box(house, mat.edge, 0, 3.51, z, 9.45, 0.16, 0.2)
  }
  box(house, mat.stone, -2.61, 5.73, -1.05, 0.78, 2.35, 0.73)
  box(house, mat.dark, -2.61, 6.92, -1.05, 0.97, 0.15, 0.89)
  box(house, mat.stone, -2.61, 7.08, -1.05, 0.56, 0.23, 0.49)
  box(house, mat.dark, -2.61, 7.24, -1.05, 0.95, 0.12, 0.88)

  function table(parent, x, y, z, w, d, height, surface = mat.edge) {
    const furniture = group(parent, x, y, z)
    mesh(furniture, new RoundedBoxGeometry(w, 0.1, d, 2, 0.025), surface, [0, height, 0], [1, 1, 1])
    for (const xx of [-1, 1]) for (const zz of [-1, 1]) {
      box(furniture, mat.trim, xx * (w / 2 - 0.13), height / 2, zz * (d / 2 - 0.13), 0.095, height, 0.095)
    }
    return furniture
  }
  function sofa(parent, x, y, z, width, angle = 0) {
    const seat = group(parent, x, y, z)
    seat.rotation.y = angle
    box(seat, mat.wood, 0, 0.22, 0, width, 0.15, 1.08)
    const sections = Math.ceil(width / 1.2)
    const cushionWidth = (width - 0.21) / sections
    for (let i = 0; i < sections; i++) {
      const offset = -width / 2 + 0.105 + (i + 0.5) * cushionWidth
      mesh(seat, new RoundedBoxGeometry(cushionWidth - 0.025, 0.24, 0.88, 3, 0.075), mat.fabric, [offset, 0.4, 0.02], [1, 1, 1])
      const back = mesh(seat, new RoundedBoxGeometry(cushionWidth - 0.02, 0.66, 0.24, 3, 0.08), mat.fabric, [offset, 0.71, -0.39], [1, 1, 1])
      back.rotation.x = -0.12
    }
    for (const x of [-width / 2, width / 2]) {
      box(seat, mat.wood, x, 0.48, 0, 0.12, 0.08, 1.05)
      for (const z of [-0.4, 0.4]) box(seat, mat.wood, x, 0.24, z, 0.09, 0.48, 0.09)
    }
    if (width > 1.5) {
      const cushion = mesh(seat, new RoundedBoxGeometry(0.44, 0.43, 0.19, 3, 0.07), mat.pillow, [-width * 0.29, 0.67, -0.32], [1, 1, 1])
      cushion.rotation.z = -0.19
    }
    return seat
  }
  sofa(scene, -2.7, 0.27, 4.55, 2.18)
  sofa(scene, 4.42, 0.27, 4.9, 0.88, -0.55)
  table(scene, -2.75, 0.27, 5.57, 1.55, 0.59, 0.36)
  const flowerPot = new T.CylinderGeometry(0.32, 0.23, 0.43, 12)
  mesh(scene, flowerPot, mat.stone, [3.91, 0.48, 4.1], [1, 1, 1])
  mesh(scene, sphere, mat.pillow, [3.91, 0.9, 4.1], [0.39, 0.59, 0.37])

  const inside = group(house)
  box(inside, mat.rug, -2.28, 0.35, -0.48, 3.6, 0.032, 3.55, false)
  const carpetStripe = material('#bc9974')
  for (let i = 0; i < 12; i++) box(inside, carpetStripe, -2.28, 0.369, -2.06 + i * 0.28, 3.47, 0.006, 0.032, false)
  sofa(inside, -3.47, 0.37, -0.9, 2.78, Math.PI / 2)
  sofa(inside, -1.7, 0.37, 1.55, 1.03, Math.PI)
  const coffeeTable = table(inside, -1.8, 0.37, -0.67, 1.47, 0.89, 0.48)
  const book = group(coffeeTable, -0.24, 0.531, 0.04)
  book.rotation.y = 0.29
  box(book, mat.paper, 0, 0.034, 0, 0.28, 0.043, 0.36)
  for (const y of [0.009, 0.062]) box(book, mat.pillow, 0, y, 0, 0.297, 0.012, 0.373)
  const ceramic = material('#dfbf97')
  const cup = new T.CylinderGeometry(0.072, 0.056, 0.108, 16)
  const coffee = new T.CylinderGeometry(0.063, 0.063, 0.004, 16)
  const handle = new T.TorusGeometry(0.034, 0.011, 6, 14)
  mesh(coffeeTable, cup, ceramic, [0.35, 0.583, -0.13], [1, 1, 1])
  mesh(coffeeTable, coffee, mat.ink, [0.35, 0.638, -0.13], [1, 1, 1], false)
  mesh(coffeeTable, handle, ceramic, [0.42, 0.587, -0.13], [0.85, 1, 1])
  const shelf = group(inside, -3.59, 0.36, -3.49)
  for (const x of [-0.79, 0.79]) box(shelf, mat.trim, x, 1.1, 0, 0.09, 2.2, 0.36)
  for (const y of [0.23, 0.83, 1.43, 2.15]) box(shelf, mat.edge, 0, y, 0, 1.6, 0.07, 0.36)
  for (let i = 0; i < 18; i++) {
    const x = -0.66 + (i % 7) * 0.18
    const y = 0.28 + Math.floor(i / 7) * 0.6
    const h = 0.18 + rng() * 0.24
    box(shelf, [mat.rug, mat.pillow, mat.ink, mat.fabric][i % 4], x, y + h / 2, 0.014, 0.115, h, 0.22)
  }
  const desk = table(inside, 1.65, 0.36, -2.6, 2.65, 1.38, 0.5)
  sofa(inside, 2.48, 0.36, -1.32, 0.72, Math.PI)
  const page = box(desk, mat.paper, 0.05, 0.562, 0.28, 0.94, 0.016, 0.63, false)
  page.rotation.y = -0.075
  const pen = box(desk, mat.ink, 0.46, 0.583, 0.25, 0.037, 0.04, 0.4)
  pen.rotation.y = 0.34
  const calendar = group(desk, -0.88, 0.55, -0.07)
  box(calendar, mat.trim, 0, 0.039, 0, 0.48, 0.07, 0.25)
  const calendarPage = group(calendar, 0, 0.245, -0.035)
  calendarPage.rotation.x = -0.21
  box(calendarPage, mat.paper, 0, 0, 0, 0.44, 0.37, 0.022)
  for (let i = 0; i < 5; i++) {
    box(calendarPage, mat.rug, -0.147 + i * 0.074, 0.187, 0.011, 0.022, 0.045, 0.032)
    for (let j = 0; j < 4; j++) box(calendarPage, mat.ink, -0.14 + i * 0.07, 0.066 - j * 0.052, 0.013, 0.029, 0.004, 0.004, false)
  }
  const turntable = makeTurntable(desk)
  box(desk, mat.ink, -0.24, 0.67, -0.48, 0.045, 0.29, 0.045)
  const shade = new T.CylinderGeometry(0.11, 0.21, 0.19, 16)
  mesh(desk, shade, mat.lamp, [-0.24, 0.87, -0.48], [1, 1, 1])
  const deskLight = new T.PointLight('#ffc27b', 0.65, 1.6, 2)
  deskLight.position.set(-0.24, 0.75, -0.47)
  desk.add(deskLight)
  const pendant = new T.CylinderGeometry(0.18, 0.37, 0.26, 18)
  for (const [x, z] of [[-2.2, -0.8], [2.7, 1.45]]) {
    beam(inside, mat.dark, [x, 4.4, z], [x, 2.95, z], 0.024)
    mesh(inside, pendant, mat.lamp, [x, 2.9, z], [1, 1, 1])
    const light = new T.PointLight('#ffc388', 17, 6, 2)
    light.position.set(x, 2.65, z)
    inside.add(light)
  }
  for (const x of [-4.09, 4.12]) {
    box(house, mat.dark, x, 2.49, 3.96, 0.24, 0.05, 0.24)
    box(house, mat.lamp, x, 2.36, 3.94, 0.16, 0.23, 0.14)
    const sconce = new T.SpotLight('#ffc381', 9, 3.6, 0.8, 0.85)
    sconce.position.set(x, 2.32, 4.08)
    sconce.target.position.set(x, 0.3, 3.74)
    house.add(sconce, sconce.target)
  }

  const mailbox = group(scene, 5.85, 0, 6.45)
  const mailboxGreen = material('#47624a')
  box(mailbox, mat.trim, 0, 0.63, 0, 0.16, 1.36, 0.19)
  box(mailbox, mailboxGreen, 0, 1.46, 0, 0.79, 0.52, 0.6)
  const lid = new T.CylinderGeometry(0.403, 0.403, 0.6, 24, 1, false, 0, Math.PI)
  const rounded = mesh(mailbox, lid, mailboxGreen, [0, 1.63, 0], [1, 1, 1])
  rounded.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  box(mailbox, mat.dark, 0, 1.54, 0.306, 0.47, 0.062, 0.018)
  box(mailbox, mat.edge, 0, 1.38, 0.312, 0.28, 0.055, 0.026)
  const envelope = box(mailbox, mat.paper, 0.055, 1.61, 0.44, 0.35, 0.23, 0.028)
  envelope.rotation.x = 0.55
  const perch = group(scene, 6.67, 0, 5.82)
  box(perch, mat.trim, 0, 0.78, 0, 0.145, 1.56, 0.15)
  box(perch, mat.edge, 0, 1.57, 0, 0.91, 0.085, 0.19)
  beam(perch, mat.wood, [0, 1.18, 0], [0.33, 1.53, 0], 0.058)
  const perchAnchor = group(perch, 0, 1.64, 0)
  perchAnchor.name = 'pigeon-perch'
  const pigeon = makePigeon(scene)
  pigeon.bird.visible = false

  const treePoints = []
  for (let i = 0; i < 83; i++) {
    const angle = rng() * Math.PI * 2
    const distance = 12 + rng() * 33
    const x = Math.sin(angle) * distance
    const z = Math.cos(angle) * distance
    if (Math.abs(x) < 8 && z > 0) continue
    const h = 7.5 + rng() * 10.5
    // Leave room for the orbit camera and foreground branches in front of the deck.
    if (distance < 31 && Math.abs(Math.atan2(x, z)) < 1.3) continue
    treePoints.push([x, z, h])
  }
  treePoints.push([-14, 3, 15], [-8, -4, 14], [10.5, -2, 16], [-3, -11, 14], [4.3, -10.7, 13])
  for (let i = 0; i < 52; i++) {
    const angle = i * Math.PI * 2 / 52
    const distance = 48 + rng() * 18
    treePoints.push([Math.sin(angle) * distance, Math.cos(angle) * distance, 12 + rng() * 7])
  }
  function instances(geometry, items, shadow = false) {
    const objects = new T.InstancedMesh(geometry, material('#ffffff'), items.length)
    const transform = new T.Object3D()
    items.forEach(({ p, s, c }, i) => {
      transform.position.set(...p)
      transform.scale.set(...s)
      transform.rotation.y = rng() * Math.PI
      transform.updateMatrix()
      objects.setMatrixAt(i, transform.matrix)
      objects.setColorAt(i, new T.Color(c))
    })
    objects.castShadow = shadow
    objects.receiveShadow = true
    scene.add(objects)
    return objects
  }
  const shrubs = []
  const blooms = []
  const blades = []
  const gravel = []
  const blade = new T.BufferGeometry()
  blade.setAttribute('position', new T.Float32BufferAttribute([
    -0.44, -0.5, 0.04, -0.19, -0.5, -0.04, -0.72, 0.46, -0.03,
    -0.11, -0.5, 0.10, 0.13, -0.5, 0.17, 0.09, 0.5, 0.08,
    0.13, -0.5, -0.16, 0.39, -0.5, -0.06, 0.58, 0.34, -0.23,
    0.02, -0.5, 0.20, 0.18, -0.5, 0.31, 0.21, 0.3, 0.57,
  ], 3))
  blade.computeVertexNormals()
  for (let i = 0; i < 22000; i++) {
    const x = (rng() - 0.5) * 45
    const z = (rng() - 0.55) * 40
    if (Math.abs(x) < 5.5 && z > -4 && z < 6.3 || x > 1.5 && x < 6.4 && z >= 6.3) continue
    const h = 0.12 + rng() * 0.43
    blades.push({ p: [x, h * 0.43 - 0.055, z], s: [0.09 + rng() * 0.1, h, 0.09 + rng() * 0.1], c: ['#6a8043', '#8b9b4e', '#4c6c40'][i % 3] })
    if (i % 130 === 0) shrubs.push({ p: [x, 0.17, z], s: [0.48, 0.33 + rng() * 0.4, 0.44] })
  }
  for (const [cx, cz] of [[-6.1, 4.1], [-4.7, 7.7], [7.2, 4], [6.2, 9.5], [-2.7, 8.9], [7.4, -2.3]]) {
    for (let i = 0; i < 36; i++) {
      const x = cx + (rng() - 0.5) * 2.8
      const z = cz + (rng() - 0.5) * 2
      const y = 0.2 + rng() * 0.34
      blades.push({ p: [x, y / 2, z], s: [0.055, y, 0.07], c: '#70884a' })
      blooms.push({ p: [x, y, z], s: [0.065, 0.045, 0.066], c: ['#e8c77f', '#d4a28e', '#a49abf', '#efe1ba'][i % 4] })
    }
  }
  for (let i = 0; i < 100; i++) {
    const z = 6.9 + rng() * 9.6
    const x = 1.8 + 1.5 * (1 - Math.exp(-(z - 6.9) * 0.48)) + rng() * 2
    const size = 0.03 + rng() * 0.075
    gravel.push({ p: [x, -0.042, z], s: [size, size * 0.4, size * 1.6], c: ['#a29376', '#c3b79b', '#aca28d'][i % 3] })
  }
  instances(blade, blades).material.side = T.DoubleSide
  addForest(scene, treePoints, shrubs, surfaces.bark, rng)
  instances(sphere, blooms)
  instances(sphere, gravel)

  // Batch static planks and furniture. The moving door and unread envelope
  // keep their own meshes so they can change without rebuilding the model.
  scene.updateMatrixWorld(true)
  const batches = new Map()
  scene.traverse((object) => {
    if (!object.isMesh || object.geometry !== cubes || object.material.transparent || object === envelope) return
    let parent = object.parent
    while (parent && parent !== door) parent = parent.parent
    if (parent === door) return
    const key = `${object.material.id}:${object.castShadow}`
    if (!batches.has(key)) batches.set(key, [])
    batches.get(key).push(object)
  })
  for (const items of batches.values()) {
    if (items.length < 2) continue
    const batch = new T.InstancedMesh(cubes, items[0].material, items.length)
    batch.castShadow = items[0].castShadow
    batch.receiveShadow = true
    items.forEach((object, index) => {
      batch.setMatrixAt(index, object.matrixWorld)
      object.removeFromParent()
    })
    scene.add(batch)
  }
  return { scene, door, envelope, pigeon, perchAnchor, turntable }
}
