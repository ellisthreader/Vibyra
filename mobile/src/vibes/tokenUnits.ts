/** Wire units are decimal strings; financial arithmetic stays on the server. */
export function tokensFromUnits(value: unknown, scale: unknown): number {
  if (scale !== 10000 || typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error('Your token balance could not be verified. Refresh and try again.');
  const units = Number(value);
  if (!Number.isSafeInteger(units)) throw new Error('Your token balance is outside the supported range.');
  return units / scale;
}
export function formatTokens(value: number, maximum = false): string {
  if (value > 0 && value < 0.01 && !maximum) return '<0.01';
  const shown = maximum ? Math.ceil(value * 100) / 100 : value;
  return shown.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
