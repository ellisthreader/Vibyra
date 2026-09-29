/**
 * Keystrokes leave the phone in order, one request at a time. Typing into the
 * terminal sends every key as it is pressed, and a fast typist — or a
 * harness — presses the next before the computer has acknowledged the last.
 * Requests raced over the transport lost runs of characters, so instead the
 * keys pressed while one request is out are gathered and go as the next.
 * Each message stays under the computer's 8 KB limit. A request that fails
 * drops what was gathered behind it: uncertain terminal input is never sent
 * again, and the keys after it would land in the wrong place.
 */
const CHUNK = 2048; // characters; four bytes each at most, so under 8 KB

export class InputQueue {
  private buffer = '';
  private flushing: Promise<void> | null = null;

  constructor(private readonly send: (data: string) => Promise<void>) {}

  push(data: string): Promise<void> {
    if (!data) return this.flushing ?? Promise.resolve();
    this.buffer += data;
    if (!this.flushing) {
      // Install the promise before invoking send, including synchronous failures.
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const work = new Promise<void>((done, fail) => {
        resolve = done;
        reject = fail;
      });
      this.flushing = work;
      void this.flush().then(resolve, reject);
      return work;
    }
    return this.flushing;
  }

  private async flush() {
    try {
      while (this.buffer) {
        // Do not split a UTF-16 surrogate pair across separately encoded RPCs.
        const end = /[\uD800-\uDBFF]/.test(this.buffer[CHUNK - 1] ?? '') ? CHUNK - 1 : CHUNK;
        const data = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end);
        await this.send(data);
      }
    } catch (error) {
      this.buffer = '';
      throw error;
    } finally {
      this.flushing = null;
    }
  }
}
