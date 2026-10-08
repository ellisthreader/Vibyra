export async function preview(args) {
  if (!Number.isInteger(args.port) || args.port < 1024 || args.port > 65535 || typeof args.path !== 'string'
    || !args.path.startsWith('/') || args.path.startsWith('//') || /[\\\r\n\x00]/.test(args.path)) throw Error('Invalid preview target');
  const url = new URL(`http://127.0.0.1:${args.port}${args.path}`);
  if (url.hostname !== '127.0.0.1' || Number(url.port) !== args.port) throw Error('Invalid preview target');
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { Accept: '*/*' } });
  let bytes = Buffer.alloc(0);
  for await (const chunk of response.body) { bytes = Buffer.concat([bytes, chunk]); if (bytes.length > 131072) throw Error('Preview resource exceeds 128 KiB'); }
  return { status: response.status, contentType: response.headers.get('content-type') ?? 'application/octet-stream', body: bytes.toString('base64') };
}
