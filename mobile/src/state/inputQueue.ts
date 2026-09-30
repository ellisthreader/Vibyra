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
    this.buffer += data;
    this.flushing ??= this.flush();
    return this.flushing;
  }

  private async flush() {
    try {
      while (this.buffer) {
        const data = this.buffer.slice(0, CHUNK);
        this.buffer = this.buffer.slice(CHUNK);
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
