import * as T from 'three'
import { createCabin, targets, views } from './model'

const v = (values) => new T.Vector3(...values)
const doorLook = [2.54, 1.57, 2.15]
const doorOutside = [2.54, 1.79, 5.2]
const doorInside = [2.54, 1.79, 2.8]
const maxRenderPixels = 4_000_000

export function mountCabin(host, labels, onError, onSettled) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.03
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.prepend(renderer.domElement)
  const { scene, door, envelope, pigeon, perchAnchor, turntable } = createCabin((loaded) => {
    if (disposed) return
    host.dataset.materials = loaded ? 'ready' : 'partial'
    dirtyShadow = true
    schedule()
  })
  const camera = new T.PerspectiveCamera(45, 1, 0.05, 120)
  const look = v(views.outside.to)
  const projected = new T.Vector3()
  const worldTargets = Object.fromEntries(Object.entries(targets).map(([name, { center, size }]) => {
    const corners = []
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      corners.push(v(center.map((value, i) => value + size[i] * [x, y, z][i] / 2)))
    }
    return [name, { center: v(center), corners }]
  }))
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const exterior = new T.Spherical().setFromVector3(v(views.outside.from).sub(look))
  const initialExterior = exterior.clone()
  const indoorDirection = v(views.inside.to).sub(v(views.inside.from))
  const indoorOffset = new T.Spherical().setFromVector3(indoorDirection)
  const initialIndoor = indoorOffset.clone()
  let view = 'outside'
  let fromView = view
  let movement = null
  let frame = 0
  let width = 1
  let height = 1
  let dirtyShadow = true
  let dirtyProjection = true
  const pointers = new Map()
  let disposed = false
  let unread = 0
  let flight = null
  let musicPlaying = false
  let lastFrame = 0
  const perch = perchAnchor.getWorldPosition(new T.Vector3())
  const facing = new T.Vector3()
  pigeon.bird.scale.setScalar(1.28)
  host.dataset.pigeon = 'away'

  function landBird(visible) {
    flight = null
    pigeon.bird.visible = visible
    pigeon.bird.position.copy(perch)
    pigeon.bird.rotation.set(0, 0.35, 0)
    for (const { wing, side } of pigeon.wings) wing.rotation.set(0, side * 1.26, side * 0.13)
    host.dataset.pigeon = visible ? 'perched' : 'away'
  }

  function fly(landing) {
    if (reduce.matches || view !== 'outside') {
      landBird(landing)
      return
    }
    const start = pigeon.bird.visible ? pigeon.bird.position.clone() : v([15.5, 7.2, -0.8])
    const middle = landing
      ? [v([11.6, 4.2, 4.6]), v([7.5, 2.4, 7.45])]
      : [v([8, 2.45, 7.1]), v([12.8, 5.5, 4.6])]
    const end = landing ? perch : v([20, 8.3, -0.7])
    flight = { curve: new T.CubicBezierCurve3(start, ...middle, end), start: performance.now(), landing }
    pigeon.bird.visible = true
    host.dataset.pigeon = landing ? 'arriving' : 'leaving'
  }

  function animateObjects(now, seconds) {
    if (flight) {
      const t = Math.min((now - flight.start) / (flight.landing ? 1850 : 1450), 1)
      if (t === 1 || view !== 'outside' || reduce.matches) {
        landBird(unread > 0)
      } else {
        const travel = flight.landing ? 1 - (1 - t) ** 1.55 : t ** 1.2
        flight.curve.getPoint(travel, pigeon.bird.position)
        flight.curve.getTangent(travel, facing)
        pigeon.bird.rotation.set(0, Math.atan2(facing.x, facing.z), 0)
        for (const { wing, side } of pigeon.wings) {
          wing.rotation.set(0, 0, side * Math.sin(t * 33) * 0.95)
        }
        schedule()
      }
    }

    const armTarget = musicPlaying ? -0.59 : 0
    if (view !== 'desk' || reduce.matches) {
      turntable.arm.rotation.y = armTarget
      return
    }
    if (Math.abs(turntable.arm.rotation.y - armTarget) > 0.006) {
      turntable.arm.rotation.y = T.MathUtils.damp(turntable.arm.rotation.y, armTarget, 9, seconds)
      schedule()
    } else {
      turntable.arm.rotation.y = armTarget
    }
    if (musicPlaying) {
      turntable.disc.rotation.y = (turntable.disc.rotation.y + seconds * 3.49) % (Math.PI * 2)
      schedule()
    }
  }

  function pose(level) {
    if (level === 'outside') {
      const target = v(views.outside.to)
      return { position: new T.Vector3().setFromSpherical(exterior).add(target), target }
    }
    const position = v(views[level].from)
    const target = level === 'inside'
      ? new T.Vector3().setFromSpherical(indoorOffset).add(position)
      : v(views[level].to)
    return { position, target }
  }
  function apply(next) {
    camera.position.copy(next.position)
    look.copy(next.target)
    camera.lookAt(look)
    camera.updateMatrixWorld()
    dirtyProjection = true
  }
  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(draw)
  }
  function viewFov(level) {
    const vertical = T.MathUtils.degToRad(level === 'desk' ? 52 : 45)
    const fit = Math.max(1, 1.45 / camera.aspect)
    return Math.min(116, T.MathUtils.radToDeg(2 * Math.atan(Math.tan(vertical / 2) * fit)))
  }
  function setFov(fov) {
    if (camera.fov === fov) return
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
  function settle() {
    movement = null
    host.dataset.moving = 'false'
    door.rotation.y = view === 'outside' ? 0 : -Math.PI * 0.49
    dirtyShadow = true
    apply(pose(view))
    setFov(viewFov(view))
  }
  function draw(now) {
    frame = 0
    const seconds = Math.min((now - lastFrame) / 1000, 0.05)
    lastFrame = now
    let settled = false
    if (movement) {
      const progress = T.MathUtils.clamp((now - movement.start) / movement.duration, 0, 1)
      const segment = Math.min(movement.poses.length - 2, Math.floor(progress * (movement.poses.length - 1)))
      const fraction = progress * (movement.poses.length - 1) - segment
      const t = T.MathUtils.smoothstep(fraction, 0, 1)
      const a = movement.poses[segment]
      const b = movement.poses[segment + 1]
      apply({ position: a.position.clone().lerp(b.position, t), target: a.target.clone().lerp(b.target, t) })
      if (progress >= 1 || reduce.matches) {
        settle()
        settled = true
      } else {
        setFov(T.MathUtils.lerp(viewFov(fromView), viewFov(view), T.MathUtils.smoothstep(progress, 0, 1)))
        if (view === 'outside' || fromView === 'outside') {
          door.rotation.y = -Math.PI * 0.49 * (view === 'outside'
            ? 1 - T.MathUtils.smoothstep(progress, 0.76, 1)
            : T.MathUtils.smoothstep(progress, 0, 0.28))
          dirtyShadow = true
        }
        schedule()
      }
    }
    if (dirtyShadow) {
      renderer.shadowMap.needsUpdate = true
      dirtyShadow = false
    }
    animateObjects(now, seconds)
    renderer.render(scene, camera)
    if (dirtyProjection) {
      positionLabels()
      dirtyProjection = false
    }
    if (settled) onSettled()
  }
  function positionLabels() {
    for (const [name, element] of Object.entries(labels)) {
      if (!element || element.hidden) continue
      const { center, corners } = worldTargets[name]
      projected.copy(center).project(camera)
      const x = (projected.x + 1) * width / 2
      const y = (1 - projected.y) * height / 2
      const margin = name === 'turntable' ? 75 : 56
      element.style.left = Math.max(margin, Math.min(width - margin, x)) + 'px'
      element.style.top = Math.max(82, Math.min(height - 72, y)) + 'px'
      let xRadius = 0
      let yRadius = 0
      for (const corner of corners) {
        projected.copy(corner).project(camera)
        xRadius = Math.max(xRadius, Math.abs((projected.x + 1) * width / 2 - x))
        yRadius = Math.max(yRadius, Math.abs((1 - projected.y) * height / 2 - y))
      }
      element.style.setProperty('--hit-width', Math.min(width * 0.45, xRadius * 2) + 'px')
      element.style.setProperty('--hit-height', Math.min(height * 0.44, yRadius * 2) + 'px')
    }
  }
  function resize() {
    width = host.clientWidth || 1
    height = host.clientHeight || 1
    camera.aspect = width / height
    if (!movement) camera.fov = viewFov(view)
    camera.updateProjectionMatrix()
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.45, Math.sqrt(maxRenderPixels / (width * height)))
    renderer.setDrawingBufferSize(width, height, pixelRatio)
    if (!movement) apply(pose(view))
    schedule()
  }
  function change(next) {
    if (view === next) return
    fromView = view
    view = next
    const destination = pose(next)
    if (reduce.matches) {
      settle()
    } else {
      const poses = [{ position: camera.position.clone(), target: look.clone() }]
      const waypoint = (position, target) => ({ position: v(position), target: v(target) })
      if (fromView === 'outside' && next === 'inside') {
        poses.push(waypoint(doorOutside, doorLook), waypoint(doorInside, views.inside.to))
      } else if (fromView === 'inside' && next === 'outside') {
        poses.push(waypoint(doorInside, [2.54, 1.55, 6.7]), waypoint(doorOutside, [2.54, 1.5, 3.6]))
      }
      poses.push(destination)
      movement = { poses, start: performance.now(), duration: poses.length > 2 ? 1350 : 780 }
      host.dataset.moving = 'true'
    }
    schedule()
  }
  function orbit(dx, dy) {
    if (movement || view === 'desk') return
    if (view === 'outside') {
      exterior.theta = T.MathUtils.clamp(exterior.theta - dx * 0.008, -1.06, 1.08)
      exterior.phi = T.MathUtils.clamp(exterior.phi - dy * 0.006, 1.05, 1.42)
    } else {
      indoorOffset.theta = T.MathUtils.clamp(indoorOffset.theta - dx * 0.007, initialIndoor.theta - 0.32, initialIndoor.theta + 0.48)
      indoorOffset.phi = T.MathUtils.clamp(indoorOffset.phi - dy * 0.006, initialIndoor.phi - 0.23, initialIndoor.phi + 0.27)
    }
    apply(pose(view))
    schedule()
  }
  function zoom(amount) {
    if (view !== 'outside' || movement) return
    exterior.radius = T.MathUtils.clamp(exterior.radius * Math.exp(amount * 0.0014), 14, 25)
    apply(pose(view))
    schedule()
  }
  const canvas = renderer.domElement
  function pointerDown(event) {
    if (view === 'desk' || movement || pointers.size >= 2 || event.button !== 0) return
    if (pointers.size && (view !== 'outside' || event.pointerType !== 'touch')) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    canvas.setPointerCapture(event.pointerId)
    canvas.dataset.dragging = 'true'
  }
  function pointerMove(event) {
    const pointer = pointers.get(event.pointerId)
    if (!pointer) return
    if (pointers.size === 2) {
      const other = [...pointers.values()].find((point) => point !== pointer)
      const before = Math.hypot(pointer.x - other.x, pointer.y - other.y)
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
      if (before > 8 && after > 8) zoom(Math.log(before / after) / 0.0014)
    } else {
      orbit(event.clientX - pointer.x, event.clientY - pointer.y)
    }
    pointer.x = event.clientX
    pointer.y = event.clientY
  }
  function pointerUp(event) {
    pointers.delete(event.pointerId)
    canvas.dataset.dragging = String(pointers.size > 0)
  }
  function wheel(event) {
    if (view !== 'outside') return
    event.preventDefault()
    zoom(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1))
  }
  function contextLost(event) {
    event.preventDefault()
    onError()
  }
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('lostpointercapture', pointerUp)
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('webglcontextlost', contextLost)
  reduce.addEventListener('change', schedule)
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  resize()

  return {
    change, orbit, zoom,
    reset() {
      if (movement) return
      exterior.copy(initialExterior)
      indoorOffset.copy(initialIndoor)
      apply(pose(view))
      schedule()
    },
    setUnread(count) {
      if ((unread > 0) !== (count > 0)) fly(count > 0)
      unread = count
      envelope.visible = count > 0
      dirtyShadow = true
      schedule()
    },
    setMusic(playing) {
      musicPlaying = playing
      turntable.lightMaterial.emissiveIntensity = playing ? 1.6 : 0
      schedule()
    },
    dispose() {
      disposed = true
      observer.disconnect()
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('lostpointercapture', pointerUp)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('webglcontextlost', contextLost)
      reduce.removeEventListener('change', schedule)
      const geometries = new Set()
      const materials = new Set()
      const textures = new Set()
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry)
        if (object.material) materials.add(object.material)
        if (object.isInstancedMesh) object.dispose()
      })
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
        material.dispose()
      }
      for (const texture of textures) texture.dispose()
      scene.traverse((object) => object.shadow?.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
