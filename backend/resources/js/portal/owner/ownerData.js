export function numeric(value) {
  if (value == null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function planCount(rows, plan) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const selected = rows.filter(row => row.plan === plan);
  if (selected.some(row => numeric(row.count) == null)) return null;
  return selected.reduce((sum, row) => sum + Number(row.count), 0);
}
export function minutes(value) {
  const seconds = numeric(value);
  return seconds == null ? null : Math.round(seconds / 60);
}
export function seriesTotal(rows, key) {
  if (!rows?.length || rows.some(row => numeric(row[key]) == null)) return null;
  return rows.reduce((sum, row) => sum + Number(row[key]), 0);
}
export function downloadCoverage(data) {
  const total = numeric(data.overview?.website?.downloads);
  const daily = seriesTotal(data.series?.website, "downloads");
  if (daily == null) return "Daily download records are unavailable for this range.";
  if (daily !== total) return "The daily chart covers the available event history and may differ from the period total.";
  return "Recorded download responses. Repeated requests and some updates can be included.";
}
export function dateValue(value) {
  if (!value) return NaN;
  const normal = /^\d{4}-\d\d-\d\d \d\d:[\d:.]+$/.test(value) ? value.replace(" ", "T") + "Z" : value;
  return new Date(normal).valueOf();
}
export function utc(value, short = false) {
  const date = new Date(dateValue(value));
  if (!Number.isFinite(date.valueOf())) return "Not recorded";
  return date.toLocaleString("en-GB", {
    dateStyle: "medium", ...(short ? {} : { timeStyle: "short" }), timeZone: "UTC",
  }) + (short ? "" : " UTC");
}
export function recent(value) {
  if (!value) return "No activity received";
  const date = dateValue(value);
  if (!Number.isFinite(date)) return "Receipt time unavailable";
  const minutesAgo = Math.max(0, Math.floor((Date.now() - date) / 60000));
  if (minutesAgo < 1) return "Received just now";
  if (minutesAgo < 60) return "Received " + minutesAgo + "m ago";
  if (minutesAgo < 1440) return "Received " + Math.floor(minutesAgo / 60) + "h ago";
  return "Received " + Math.floor(minutesAgo / 1440) + "d ago";
}
export const isGuest = account => /@guests\.vibyra\.invalid$/i.test(account.email || "");

export function licenseStatus(row, now = Date.now()) {
  if (row.revoked_at) return "Revoked";
  const expiry = dateValue(row.redeemed_at ? row.ends_at : row.claim_by);
  if (!Number.isFinite(expiry)) return "Status unavailable";
  if (row.redeemed_at) return expiry <= now ? "Expired" : "Active";
  return expiry <= now ? "Unclaimed · expired" : "Ready to claim";
}
