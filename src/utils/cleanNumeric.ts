/**
 * Safe numeric parser that strips commas, currency symbols (₹, $, etc.),
 * and whitespace before converting to a valid finite Number.
 * Prevents JavaScript string parsing pitfalls like parseFloat("2,954.49") -> 2.
 */
export function cleanNumeric(val: any, fallback: number = 0): number {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) || !isFinite(val) ? fallback : val;
  const cleaned = String(val).replace(/[₹$,\s]/g, '').trim();
  if (!cleaned) return fallback;
  const num = Number(cleaned);
  return isNaN(num) || !isFinite(num) ? fallback : num;
}

export default cleanNumeric;

