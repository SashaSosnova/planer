/** WHO-style daily vegetable target (grams). */
export const VEG_GOAL_G = 400

/** Everyday target: 1.1 g protein per kg body weight. */
const PROTEIN_PER_KG = 1.1

/** Daily protein goal: 1.1 g per kg body weight. */
export function calcProteinGoal(weightKg: number): number | null {
  if (!(weightKg > 0)) return null
  return Math.round(weightKg * PROTEIN_PER_KG)
}
