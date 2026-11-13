import * as T from 'three'

export function addPorchDetails(house) {
  const ceramic = new T.MeshStandardMaterial({ color: '#9d9780', roughness: 0.86 })
  const soil = new T.MeshStandardMaterial({ color: '#3b3023', roughness: 1 })
  const foliage = new T.MeshStandardMaterial({ color: '#536c42', roughness: 0.92 })
  const potGeometry = new T.LatheGeometry([
    new T.Vector2(0.16, 0), new T.Vector2(0.23, 0.04), new T.Vector2(0.28, 0.38),
    new T.Vector2(0.29, 0.43), new T.Vector2(0.25, 0.43), new T.Vector2(0.24, 0.37),
  ], 24)
  const leafGeometry = new T.SphereGeometry(1, 8, 6)
  const stemGeometry = new T.CylinderGeometry(0.009, 0.014, 1, 6)
  const soilGeometry = new T.CylinderGeometry(0.243, 0.243, 0.025, 20)
  const add = (parent, geometry, material, position, scale = [1, 1, 1]) => {
    const mesh = new T.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.castShadow = mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  for (const [x, y, z, scale] of [[3.91, 0.27, 4.1, 1], [-3.03, 1.08, 4.6, 0.46], [-2.51, 1.08, 4.64, 0.36]]) {
    const pot = new T.Group()
    pot.position.set(x, y, z)
    pot.scale.setScalar(scale)
    house.add(pot)
    add(pot, potGeometry, ceramic, [0, 0, 0])
    add(pot, soilGeometry, soil, [0, 0.375, 0])
    for (let branch = 0; branch < 7; branch++) {
      const angle = branch * 2.399
      const height = 0.48 + (branch % 3) * 0.17
      const stem = add(pot, stemGeometry, foliage, [Math.sin(angle) * 0.10, 0.38 + height / 2, Math.cos(angle) * 0.10], [1, height, 1])
      stem.rotation.z = Math.cos(angle) * 0.16
      for (let j = 0; j < 6; j++) {
        const a = angle + j * 2.4
        const leaf = add(pot, leafGeometry, foliage,
          [Math.sin(a) * 0.12, 0.44 + j * height / 6, Math.cos(a) * 0.12], [0.055, 0.012, 0.16])
        leaf.rotation.set(0.3, a, -0.2)
      }
    }
  }
  const cupMaterial = new T.MeshStandardMaterial({ color: '#e4d6b9', roughness: 0.48 })
  const cup = new T.LatheGeometry([
    new T.Vector2(0.05, 0), new T.Vector2(0.067, 0.10), new T.Vector2(0.059, 0.10), new T.Vector2(0.046, 0.015),
  ], 24)
  add(house, cup, cupMaterial, [-0.86, 0.685, 5.58])
  add(house, new T.TorusGeometry(0.032, 0.009, 8, 16), cupMaterial, [-0.79, 0.743, 5.58])
  add(house, new T.CylinderGeometry(0.056, 0.056, 0.003, 24), soil, [-0.86, 0.77, 5.58])
  house.updateMatrixWorld(true)
  const inverse = house.matrixWorld.clone().invert()
  for (const geometry of [leafGeometry, stemGeometry]) {
    const items = []
    house.traverse(object => { if (object.isMesh && object.geometry === geometry) items.push(object) })
    const batch = new T.InstancedMesh(geometry, foliage, items.length)
    batch.castShadow = batch.receiveShadow = true
    items.forEach((object, i) => {
      batch.setMatrixAt(i, new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld))
      object.removeFromParent()
    })
    house.add(batch)
  }
}
