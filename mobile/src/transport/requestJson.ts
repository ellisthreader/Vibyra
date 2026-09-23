/** HTTP framing only. Each feature still decides authentication and error wording. */
export async function requestJson(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal });
    const raw = await response.text().catch(() => '');
    let data: any = {};
    try {
      const decoded: unknown = raw ? JSON.parse(raw) : null;
      if (decoded && typeof decoded === 'object') data = decoded;
    } catch {
      /* An HTTP status still matters when a proxy sends HTML. */
    }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

export const apiUrl = (base: string, path: string) => `${base.replace(/\/+$/, '')}/api/${path}`;
