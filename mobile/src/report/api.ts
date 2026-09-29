export interface ReportContext {
  appVersion: string;
  platform: string;
  hardware: string;
  screen: string;
  project?: string | null;
  projectRoot?: string | null;
  agent?: string | null;
  pane?: string | null;
}

export interface ReportInput {
  summary: string;
  details: string;
  context: ReportContext;
  imageUri?: string | null;
}

export interface ReportApi {
  send(input: ReportInput): Promise<string>;
}

const onDisk = /^(file|content|ph|assets-library):/i;

/** The phone uses the signed-in desktop report route and its server-side identity/IP. */
export function createReportApi(
  baseUrl: string,
  token: () => string | null,
  fetchImpl: typeof fetch = fetch,
  read: typeof fetch = fetch,
): ReportApi {
  const root = baseUrl.replace(/\/+$/, '');
  return {
    send: async (input) => {
      const bearer = token();
      if (!bearer) throw new Error('Sign in to Vibyra to send a report.');
      const form = new FormData();
      form.append(
        'report',
        JSON.stringify({
          kind: 'bug',
          severity: 'normal',
          summary: input.summary.trim(),
          details: input.details.trim(),
          area: 'Mobile app',
          includeDiagnostics: true,
          context: input.context,
        }),
      );
      if (input.imageUri) {
        if (onDisk.test(input.imageUri))
          form.append('images[]', {
            uri: input.imageUri,
            name: 'report-image.jpg',
            type: 'image/jpeg',
          } as unknown as Blob);
        else {
          let blob: Blob;
          try {
            blob = await (await read(input.imageUri)).blob();
          } catch {
            throw new Error('That image could not be read. Choose another.');
          }
          form.append('images[]', blob, 'report-image.jpg');
        }
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000);
      let response: Response;
      try {
        response = await fetchImpl(`${root}/api/reports`, {
          method: 'POST',
          body: form,
          headers: { Accept: 'application/json', Authorization: `Bearer ${bearer}` },
          signal: controller.signal,
        });
      } catch {
        throw new Error(
          'Delivery was not confirmed. Check with support before retrying to avoid a duplicate.',
        );
      } finally {
        clearTimeout(timeout);
      }
      const payload = (await response.json().catch(() => null)) as {
        id?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok || typeof payload?.id !== 'string') {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Delivery was not confirmed. Check with support before retrying to avoid a duplicate.',
        );
      }
      return payload.id;
    },
  };
}
