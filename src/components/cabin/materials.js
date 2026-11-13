import * as T from 'three'

// These local CC0 maps are documented in public/cabin/materials/SOURCES.md.
export function cabinMaterials(onLoaded) {
  let failed = false
  const manager = new T.LoadingManager(() => onLoaded(!failed))
  manager.onError = () => { failed = true }
  const loader = new T.TextureLoader(manager)
  function surface(name, repeat, color, relief) {
    const material = new T.MeshStandardMaterial({
      color, normalScale: new T.Vector2(relief, relief), roughness: 0.95,
    })
    for (const [kind, property] of [['color', 'map'], ['normal', 'normalMap'], ['roughness', 'roughnessMap']]) {
      const texture = loader.load(`/cabin/materials/${name}-${kind}.webp`, undefined, undefined, () => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        context.fillStyle = kind === 'normal' ? '#8080ff' : '#ffffff'
        context.fillRect(0, 0, 1, 1)
        texture.image = canvas
        texture.needsUpdate = true
      })
      texture.wrapS = texture.wrapT = T.RepeatWrapping
      texture.repeat.set(...repeat)
      texture.anisotropy = 4
      if (name === 'plywood') texture.rotation = Math.PI / 2
      if (name === 'wood-planks') {
        texture.rotation = Math.PI / 2
        texture.offset.y = 0.12
      }
      if (kind === 'color') texture.colorSpace = T.SRGBColorSpace
      material[property] = texture
    }
    return material
  }
  return {
    timber: surface('plywood', [0.5, 2], '#dfbc91', 0.22),
    cladding: surface('wood-planks', [1, 0.10], '#fff3da', 0.3),
    bark: surface('bark_brown_02', [2, 4], '#c0b7a6', 1.05),
    earth: surface('forest_ground_04', [33, 33], '#c4d89b', 0.55),
  }
}
