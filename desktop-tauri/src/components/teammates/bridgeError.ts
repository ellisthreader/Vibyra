/**
 * The account bridge reports a refusal as `"409: words"` and, for Agent v2 calls that carry them, a
 * machine `code` and `fix` after U+001E as compact JSON (`teammates_v2_overview_routes::error_suffix`).
 * This splits them so every existing caller keeps seeing the clean words, while new ones can branch
 * on `.code` / `.fix` exactly as the phone does.
 */
export interface BridgeFix { action: string; message: string }
export interface BridgeMeta { message: string; code: string | null; fix: BridgeFix | null }

const SEPARATOR = '\u001e';
const word = (v: unknown, max: number) => (typeof v === 'string' && /^[a-z0-9_]+$/.test(v) && v.length <= max ? v : null);

export function parseBridgeError(raw: string): BridgeMeta {
  const at = raw.indexOf(SEPARATOR);
  if (at < 0) return { message: raw, code: null, fix: null };
  const message = raw.slice(0, at);
  try {
    const meta = JSON.parse(raw.slice(at + 1));
    const f = meta?.fix;
    const action = word(f?.action, 40);
    return { message, code: word(meta?.code, 60),
      fix: action && typeof f.message === 'string' && f.message.trim() ? { action, message: f.message.trim().slice(0, 300) } : null };
  } catch { return { message, code: null, fix: null }; }
}

/** An `Error` whose `.message` is the clean text, with the machine parts beside it. */
export class BridgeError extends Error {
  readonly code: string | null;
  readonly fix: BridgeFix | null;
  constructor(message: string, code: string | null, fix: BridgeFix | null) { super(message); this.code = code; this.fix = fix; }
}
export function toBridgeError(error: unknown): unknown {
  if (error instanceof BridgeError) return error;
  const raw = error instanceof Error ? error.message : String(error);
  const parsed = parseBridgeError(raw);
  // Nothing structured rode along: hand back exactly what the bridge threw.
  return parsed.message === raw ? error : new BridgeError(parsed.message, parsed.code, parsed.fix);
}
export const codeOf = (error: unknown): string | null => (error instanceof BridgeError ? error.code : null);
export const fixOf = (error: unknown): BridgeFix | null => (error instanceof BridgeError ? error.fix : null);
