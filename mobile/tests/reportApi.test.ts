import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportApi } from '../src/report/api';

const context = { appVersion: '1.0.0 (7)', platform: 'iOS 26.6', hardware: 'iPhone 17 Pro', screen: '402×874 @ 3x' };
const input = { summary: 'Blank preview', details: 'The preview opens to a blank screen.', context };

test('phone reports send authenticated multipart data with diagnostics on', async () => {
  let sent: RequestInit | undefined;
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent = init;
    return new Response(JSON.stringify({ ok: true, id: 'VR-PHONE1' }), { status: 200 });
  }) as typeof fetch;
  const api = createReportApi('https://api.example.test/', () => 'phone-token', fetcher);
  assert.equal(await api.send(input), 'VR-PHONE1');
  assert.equal((sent?.headers as Record<string, string>).Authorization, 'Bearer phone-token');
  assert.equal((sent?.headers as Record<string, string>)['Content-Type'], undefined);
  const report = JSON.parse(String((sent?.body as FormData).get('report')));
  assert.equal(report.includeDiagnostics, true);
  assert.equal(report.context.platform, 'iOS 26.6');
  assert.equal(report.context.hardware, 'iPhone 17 Pro');
  assert.equal(report.area, 'Mobile app');
});

test('a browser-selected image is included as one JPEG attachment', async () => {
  let form: FormData | undefined;
  const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
    form = init?.body as FormData;
    return new Response(JSON.stringify({ ok: true, id: 'VR-PHONE2' }), { status: 200 });
  }) as typeof fetch;
  const read = (async () => new Response(new Blob(['image'], { type: 'image/jpeg' }))) as typeof fetch;
  const api = createReportApi('https://api.example.test', () => 'phone-token', fetcher, read);
  await api.send({ ...input, imageUri: 'blob:test-image' });
  assert.equal((form?.get('images[]') as File).name, 'report-image.jpg');
  assert.equal((form?.get('images[]') as File).type, 'image/jpeg');
});

test('a missing account and an ambiguous send never retry automatically', async () => {
  const signedOut = createReportApi('https://api.example.test', () => null);
  await assert.rejects(signedOut.send(input), /Sign in/);
  let sends = 0;
  const fetcher = (async () => { sends++; throw new Error('connection lost'); }) as typeof fetch;
  const api = createReportApi('https://api.example.test', () => 'phone-token', fetcher);
  await assert.rejects(api.send(input), /before retrying to avoid a duplicate/);
  assert.equal(sends, 1);
});
