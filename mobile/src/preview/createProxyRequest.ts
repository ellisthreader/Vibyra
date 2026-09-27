import { PreviewReceiveCredit, PreviewSendCredit } from './credit';
import type { PreviewKey } from './frameCodec';
import type { PreviewRequest } from './controllerTypes';

export function createProxyRequest(
  key: PreviewKey,
  kind: PreviewRequest['kind'],
  metadata: Uint8Array,
  window: number,
): PreviewRequest {
  return {
    key,
    kind,
    send: new PreviewSendCredit(),
    metadataBytes: metadata.length,
    nativeReadIssued: 0n,
    queued: [{ kind: 'data', key, sequence: 0, bytes: metadata }],
    queuedBytes: metadata.length,
    bodyBytes: 0,
    nextBody: 1,
    end: null,
    inputEnded: false,
    response: new PreviewReceiveCredit(window),
    responseOpened: false,
    responseCreditSent: 0n,
    responseStarted: false,
    processing: Promise.resolve(),
  };
}
