import type { PreviewReceiveCredit, PreviewSendCredit } from './credit';
import type { PreviewFrame, PreviewKey } from './frameCodec';

export type NativeEvent = 'onPreviewRequest' | 'onPreviewBody' | 'onPreviewEnd' | 'onPreviewCancel';
export interface NativePreviewProxy {
  addListener(name: NativeEvent, callback: (event: any) => void): { remove(): void };
  startProxy(generation: string): Promise<string>;
  stopProxy(): Promise<void>;
  responseStart(
    id: string,
    status: number,
    headers: Record<string, string>,
    setCookies: string[],
  ): Promise<void>;
  responseData(id: string, dataBase64: string): Promise<void>;
  responseEnd(id: string): Promise<void>;
  responseCancel(id: string): Promise<void>;
  allowRequestRead(id: string, bytes: number): Promise<void>;
}

export interface PreviewRequest {
  key: PreviewKey;
  kind: 'http' | 'upgrade';
  send: PreviewSendCredit;
  metadataBytes: number;
  nativeReadIssued: bigint;
  queued: Extract<PreviewFrame, { kind: 'data' }>[];
  queuedBytes: number;
  bodyBytes: number;
  nextBody: number;
  end: number | null;
  inputEnded: boolean;
  response: PreviewReceiveCredit | null;
  responseStarted: boolean;
  processing: Promise<void>;
}
