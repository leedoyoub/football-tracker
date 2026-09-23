/** Preserves zero while making positive record values explicitly signed. */
export function formatSignedTwoDecimals(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}
