export function drawRandomNumber(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error('Enter a positive whole number.')
  const max = Number(value)
  if (!Number.isSafeInteger(max) || max < 1 || max > 1_000_000_000) throw new Error('Enter a whole number from 1 to 1,000,000,000.')
  return Math.floor(Math.random() * max) + 1
}
