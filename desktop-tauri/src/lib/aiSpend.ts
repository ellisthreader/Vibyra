/** Formatting helpers for the Vibyra AI settings pane. */

/** Sub-cent amounts are the normal case here, so 2 decimals would read $0.00. */
export function usd(amount: number): string {
  if (amount <= 0) return "$0.00";
  return amount < 0.01 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}

/** Percentage full, clamped. A cap of zero means uncapped, so nothing to fill. */
export function meter(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(100, (used / cap) * 100));
}

export function capLabel(cap: number, formatted: string): string {
  return cap > 0 ? formatted : "no limit";
}

export function minutes(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}
