import { PREVIEW_CHUNK, PREVIEW_WINDOW } from './frameCodec';

/** Counts actual transmitted body/header bytes, not JSON/base64 bridge bytes. */
export class PreviewSendCredit {
  private total = 0n;
  private sent = 0n;
  get totalGranted(): bigint {
    return this.total;
  }
  grant(value: string): void {
    const next = BigInt(value);
    if (next < this.total || next > this.sent + BigInt(PREVIEW_WINDOW)) {
      throw new Error('Invalid Preview credit.');
    }
    this.total = next;
  }
  take(length: number): boolean {
    if (!Number.isInteger(length) || length < 1 || length > PREVIEW_CHUNK) {
      throw new Error('Invalid Preview chunk size.');
    }
    if (this.sent + BigInt(length) > this.total) return false;
    this.sent += BigInt(length);
    return true;
  }
}

/** Credit is replenished only after the native socket has consumed data. */
export class PreviewReceiveCredit {
  private issued: bigint;
  private received = 0n;
  private acknowledged = 0n;
  private next = 0;
  private ended = false;
  constructor(initial = PREVIEW_WINDOW) {
    if (!Number.isInteger(initial) || initial < 1 || initial > PREVIEW_WINDOW) {
      throw new Error('Invalid Preview window.');
    }
    this.issued = BigInt(initial);
  }
  get initialTotal(): string {
    return this.issued.toString();
  }
  accept(sequence: number, length: number): void {
    if (
      this.ended ||
      sequence !== this.next ||
      !Number.isInteger(length) ||
      length < 1 ||
      length > PREVIEW_CHUNK ||
      this.received + BigInt(length) > this.issued
    ) {
      throw new Error('Preview data exceeded credit or arrived out of order.');
    }
    this.received += BigInt(length);
    this.next++;
  }
  acknowledge(length: number): string {
    if (
      !Number.isInteger(length) ||
      length < 1 ||
      this.acknowledged + BigInt(length) > this.received
    ) {
      throw new Error('Invalid Preview acknowledgement.');
    }
    this.acknowledged += BigInt(length);
    this.issued += BigInt(length);
    return this.issued.toString();
  }
  end(sequence: number): void {
    if (this.ended || sequence !== this.next) throw new Error('Preview ended out of order.');
    this.ended = true;
  }
}
