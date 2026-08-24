const MAX_PROMPT_CHARS = 4_000;

function insertAt(value: string, cursor: number, text: string): [string, number] {
  const room = Math.max(0, MAX_PROMPT_CHARS - value.length);
  const inserted = text.slice(0, room);
  return [value.slice(0, cursor) + inserted + value.slice(cursor), cursor + inserted.length];
}

/**
 * Reconstructs the current TUI input line without ever putting the prompt in
 * app state.
 *
 * This is the fallback for CLIs that keep no readable transcript of their own;
 * where one exists, `terminalChatPrompt` reads the submitted prompt instead of
 * inferring it from keys.
 */
export class TerminalPromptTracker {
  private value = "";
  private cursor = 0;
  private pasted = false;
  private protocol: "text" | "escape" | "csi" | "string" | "string-escape" | "ss3" = "text";
  private pending = "";
  private stringAllowsBell = false;

  push(data: string): string | null {
    for (const char of data) {
      if (this.consumeProtocol(char)) continue;
      if (this.pasted && (char === "\r" || char === "\n")) {
        [this.value, this.cursor] = insertAt(this.value, this.cursor, " ");
      } else if (char === "\r" || char === "\n") {
        const submitted = this.value;
        this.reset();
        if (submitted) return submitted;
      } else if (char === "\x7f" || char === "\b") {
        if (this.cursor > 0) {
          this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
          this.cursor -= 1;
        }
      } else if (char === "\x01") {
        this.cursor = 0;
      } else if (char === "\x05") {
        this.cursor = this.value.length;
      } else if (char === "\x03" || char === "\x15") {
        this.reset();
      } else if (char >= " ") {
        [this.value, this.cursor] = insertAt(this.value, this.cursor, char);
      }
    }
    return null;
  }

  /**
   * xterm's data event also carries replies it generates for terminal queries.
   * Consume those protocol frames while retaining the keys used to edit input.
   */
  private consumeProtocol(char: string): boolean {
    const code = char.charCodeAt(0);
    if (this.protocol === "text") {
      if (char === "\x1b") this.protocol = "escape";
      else if (char === "\x9b") this.startCsi();
      else if (char === "\x9d") this.startString(true);
      else if ([0x90, 0x98, 0x9e, 0x9f].includes(code)) this.startString(false);
      else return code >= 0x80 && code <= 0x9f;
      return true;
    }
    if (this.protocol === "escape") {
      // A second ESC restarts the frame rather than ending it: Alt-prefixed
      // keys arrive as `ESC ESC [ A`, and falling back to text here would
      // leave the `[A` to be typed into the prompt.
      if (char === "\x1b") return true;
      if (char === "[") this.startCsi();
      else if (char === "]") this.startString(true);
      else if (["P", "X", "^", "_"].includes(char)) this.startString(false);
      else if (char === "O") this.startSs3("\x1bO");
      else if (code >= 0x20 && code <= 0x2f) this.startSs3("");
      else this.protocol = "text";
      return true;
    }
    if (this.protocol === "ss3") {
      const sequence = this.pending;
      this.protocol = "text";
      this.pending = "";
      // Only `ESC O` carries a key; the 0x20-0x2f intermediates are charset
      // selections, whose final byte means nothing to a line editor.
      if (sequence) this.applySequence(sequence + char);
      return true;
    }
    if (this.protocol === "csi") {
      this.pending += char;
      if (code >= 0x40 && code <= 0x7e) {
        const sequence = this.pending;
        this.protocol = "text";
        this.pending = "";
        this.applySequence(sequence);
      }
      return true;
    }
    if (this.protocol === "string-escape") {
      if (char === "\\") this.protocol = "text";
      else this.protocol = char === "\x1b" ? "string-escape" : "string";
      return true;
    }
    if (char === "\x9c" || (this.stringAllowsBell && char === "\x07")) {
      this.protocol = "text";
    } else if (char === "\x1b") {
      this.protocol = "string-escape";
    }
    return true;
  }

  private startCsi(): void {
    this.protocol = "csi";
    this.pending = "\x1b[";
  }

  private startSs3(sequence: string): void {
    this.protocol = "ss3";
    this.pending = sequence;
  }

  private startString(allowsBell: boolean): void {
    this.protocol = "string";
    this.stringAllowsBell = allowsBell;
  }

  /**
   * Cursor keys reach here as CSI or, once a TUI turns on application cursor
   * mode, as the SS3 forms `ESC O D` and `ESC O C`. Both have to move the
   * tracked cursor or a mid-line edit lands at the wrong offset.
   */
  private applySequence(sequence: string): void {
    if (sequence === "\x1b[200~") this.pasted = true;
    if (sequence === "\x1b[201~") this.pasted = false;
    const final = sequence.at(-1);
    if (final === "D") this.cursor = Math.max(0, this.cursor - 1);
    if (final === "C") this.cursor = Math.min(this.value.length, this.cursor + 1);
    if (final === "H" || sequence === "\x1b[1~") this.cursor = 0;
    if (final === "F" || sequence === "\x1b[4~") this.cursor = this.value.length;
    if (sequence === "\x1b[3~" && this.cursor < this.value.length) {
      this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
    }
  }

  private reset(): void {
    this.value = "";
    this.cursor = 0;
    this.pasted = false;
  }
}
