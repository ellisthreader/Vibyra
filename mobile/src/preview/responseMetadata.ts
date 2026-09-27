const decode = new TextDecoder('utf-8', { fatal: true });

/** Validate the Mac response before passing its headers to the loopback socket. */
export function responseMetadata(bytes: Uint8Array, kind: 'http' | 'upgrade'): {
  status: number; headers: Record<string, string>; setCookies: string[];
} {
  const metadata = JSON.parse(decode.decode(bytes));
  if (metadata.v !== 1 || !Number.isInteger(metadata.status)
    || metadata.status < 100 || metadata.status > 599 || !metadata.headers
    || typeof metadata.headers !== 'object') throw new Error('Invalid Preview response.');
  if (metadata.status === 101 && kind !== 'upgrade') {
    throw new Error('Unexpected Preview protocol upgrade.');
  }
  const setCookies = metadata.setCookies ?? [];
  if (!Array.isArray(setCookies) || setCookies.length > 16
    || setCookies.some((cookie: unknown) => typeof cookie !== 'string' || cookie.length > 4096)) {
    throw new Error('Invalid Preview cookies.');
  }
  return { status: metadata.status, headers: metadata.headers, setCookies };
}
