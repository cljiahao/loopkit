// How many new multiples of `required` were crossed going from prevCount to
// nextCount. Not a boolean "did we cross one" — points_per_visit (Stamp) and
// growth_per_visit (Plant) can both jump by more than 1 in a single visit,
// so a jump can cross more than one reward threshold at once.
export function countThresholdCrossings(
  prevCount: number,
  nextCount: number,
  required: number,
): number {
  return Math.floor(nextCount / required) - Math.floor(prevCount / required);
}
