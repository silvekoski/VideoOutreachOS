export function shareOfMax(value: number | null, values: readonly (number | null)[]): number | null {
  const max = Math.max(0, ...values.filter((v): v is number => v !== null))
  return value === null || max === 0 ? null : value / max
}
