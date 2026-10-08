/** "just now", "2 min ago", "3 h ago", "Yesterday", "12 Sep" from unix seconds. */
export function agoFromSeconds(seconds: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - seconds * 1000);
  if (delta < 45_000) return "just now";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(seconds * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
