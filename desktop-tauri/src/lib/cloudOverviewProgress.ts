import { agoFromSeconds } from "./cloudSyncState";
import { cloudMoving, cloudReady } from "./cloudOverview";
import type { CloudLiveRow, CloudPhase, CloudProgress } from "./cloudOverviewTypes";

const BANDS: Partial<Record<CloudPhase, { from: number; to: number; typical: number }>> = {
  waiting_cloud: { from: 0, to: 0.2, typical: 30 }, preparing: { from: 0.2, to: 0.25, typical: 10 },
  uploading: { from: 0.25, to: 0.85, typical: 45 }, saved: { from: 0.85, to: 0.9, typical: 30 }, applying: { from: 0.9, to: 0.99, typical: 15 },
};
const FLIGHT: CloudPhase[] = ["waiting_cloud", "preparing", "uploading", "saved", "applying"];
interface Seen { phase: CloudPhase | "hold"; phaseAt: number; flightAt: number | null; sent?: number; sentAt?: number; rate?: number }

/** One per mounted account/connection page. Estimates move the picture, never the project's phase. */
export class CloudProgressClock {
  private seen = new Map<string, Seen>();
  progress(row: CloudLiveRow, now: number): CloudProgress {
    const before = this.seen.get(row.key), phase = row.hold ? "hold" : row.phase;
    const server = row.since ? Date.parse(row.since) : NaN;
    const phaseAt = before?.phase === phase ? before.phaseAt : Number.isFinite(server) && server <= now && before?.phase !== "hold" ? server : now;
    const moving = cloudMoving(row), flightAt = moving ? Math.min(before?.flightAt ?? phaseAt, phaseAt) : null;
    const next: Seen = { phase, phaseAt, flightAt };
    if (row.phase === "uploading" && row.upload) {
      const sent = row.upload.sent;
      next.sent = sent; next.sentAt = now; next.rate = before?.rate;
      if (before?.sent !== undefined && before.sentAt !== undefined && sent > before.sent && now > before.sentAt) {
        const rate = (sent - before.sent) / ((now - before.sentAt) / 1000);
        next.rate = before.rate ? before.rate * 0.6 + rate * 0.4 : rate;
      } else if (before?.sent === sent) { next.sent = before.sent; next.sentAt = before.sentAt; }
    }
    this.seen.set(row.key, next);
    if (cloudReady(row)) return { progress: 1, moving: false, slow: false, left: 0, flightAt: null };
    const band = BANDS[row.phase];
    if (!band || !moving) return { progress: 0, moving: false, slow: false, left: null, flightAt: null };
    const elapsed = Math.max(0, (now - phaseAt) / 1000), upload = row.phase === "uploading" && row.upload && row.upload.total > 0 ? row.upload : null;
    const share = upload ? Math.min(0.99, upload.sent / upload.total) : Math.min(0.95, 1 - Math.exp(-1.1 * elapsed / band.typical));
    const phaseLeft = upload ? Math.max(0, upload.total - upload.sent) / (next.rate ?? 1_500_000) : Math.max(5, band.typical - elapsed);
    const ahead = FLIGHT.slice(FLIGHT.indexOf(row.phase) + 1).reduce((sum, p) => sum + (BANDS[p]?.typical ?? 0), 0);
    const slow = !upload && elapsed > Math.max(band.typical * 3, band.typical + 60);
    return { progress: band.from + (band.to - band.from) * share, moving, slow, left: slow ? null : phaseLeft + ahead, flightAt };
  }
}
export function cloudOverall(rows: CloudLiveRow[], bars: Record<string, CloudProgress>): number {
  const counted = rows.filter(r => r.phase !== "skipped");
  return counted.length ? counted.reduce((sum, r) => sum + (bars[r.key]?.progress ?? 0), 0) / counted.length : 0;
}
export function cloudTimeLine(bars: Record<string, CloudProgress>, now: number): string | null {
  const moving = Object.values(bars).filter(b => b.moving);
  if (!moving.length) return null;
  const since = Math.min(...moving.map(b => b.flightAt ?? now)), ago = agoFromSeconds(since / 1000, now);
  const started = ago === "just now" ? "Just started" : `Started ${ago}`;
  if (moving.some(b => b.slow)) return `${started} · taking longer than usual`;
  const left = Math.max(...moving.map(b => b.left ?? 0));
  return `${started} · ${left < 60 ? "under a minute left" : `about ${Math.round(left / 60)} min left`}`;
}
export const cloudBarCaption = (bar: CloudProgress) => bar.slow ? "Longer than usual" : bar.left === null ? null
  : bar.left < 60 ? "Under a minute" : `About ${Math.round(bar.left / 60)} min`;
