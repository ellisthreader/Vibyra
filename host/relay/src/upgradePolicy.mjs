// Origins are configuration, never inferred from Host or forwarded headers.
// The native phone's private WebView uses localhost; native Rust sends none.
export const NATIVE_ORIGINS = ['http://localhost', 'https://localhost'];

export function createUpgradePolicy({ path = '/', origins = NATIVE_ORIGINS } = {}) {
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9/_-]*$/.test(path) || path.length > 200)
    throw new Error('Configure one explicit relay WebSocket path');
  if (!Array.isArray(origins) || origins.some(origin => !validOrigin(origin)))
    throw new Error('Relay origins must be an array of exact HTTP(S) origins');
  const allowed = new Set(origins);
  return req => {
    if (req.method !== 'GET' || req.url !== path) return 404;
    const count = req.rawHeaders?.filter((_, index, values) => index % 2 === 0 && values[index].toLowerCase() === 'origin').length ?? 0;
    if (count > 1) return 403;
    const origin = req.headers.origin;
    return origin === undefined || (typeof origin === 'string' && allowed.has(origin)) ? null : 403;
  };
}

function validOrigin(value) {
  // Opaque origins require explicit opt-in for the existing sandboxed web runtime.
  if (value === 'null') return true;
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch { return false; }
}
