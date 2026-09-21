import { paletteFor, type AccentId, type Colors } from '../theme';
const cache = new Map<string, Colors>();
/** Approved workspace surfaces, preserving explicitly selected accent alternatives. */
export function workspacePalette(dark: boolean, accent: AccentId = 'cobalt'): Colors {
  const key = `${dark}:${accent}`; const saved = cache.get(key); if (saved) return saved;
  const base = paletteFor(dark, accent);
  const colors = { ...base, ...(dark ? { background:'#101115',rail:'#15171c',surface:'#15171c',elevated:'#24272f',border:'#2a2d34',text:'#eef0f4',muted:'#929aa9' } : { background:'#ffffff',rail:'#fafafb',surface:'#ffffff',workspace:'#ffffff',elevated:'#f0f2f5',border:'#e5e7eb',text:'#242932',muted:'#737b89' }), ...(accent === 'cobalt' ? {action:'#4667e8'} : {}) };
  cache.set(key, colors); return colors;
}
