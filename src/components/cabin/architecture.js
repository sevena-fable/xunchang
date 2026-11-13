// One building transform is shared by geometry, camera paths and hit targets.
// The reference has a narrower gable and a longer side wall than the old cabin.
export const buildingScale = [0.82, 1, 1.16]
export const buildingPoint = (point) => point.map((value, axis) => value * buildingScale[axis])

export const referenceCamera = {
  from: [-12, 4.1, 13.6],
  to: [1.5, 2.8, 1.5],
}
