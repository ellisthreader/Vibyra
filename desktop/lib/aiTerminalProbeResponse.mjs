const CURSOR_POSITION_QUERY = "\x1b[6n";

export function terminalStartupProbeResponder(config = {}) {
  const runtimeId = String(config.launchPlan?.runtimeId || config.agent || "");
  const enabled = runtimeId === "codex" || config.agent === "codex";
  let cols = clampDimension(config.cols, 100, 18, 240);
  let rows = clampDimension(config.rows, 30, 4, 80);
  let rendererAttached = false;
  let startupProbeAnswered = false;
  let pending = "";
  const cursor = terminalCursorTracker({ cols, rows });

  return {
    filter(data) {
      const value = pending + String(data || "");
      pending = "";
      if (!enabled) return { output: value, response: "" };

      const partialLength = trailingQueryPrefixLength(value);
      const complete = partialLength ? value.slice(0, -partialLength) : value;
      if (partialLength) pending = value.slice(-partialLength);
      const parts = complete.split(CURSOR_POSITION_QUERY);
      let output = parts[0];
      cursor.consume(parts[0]);
      let response = "";
      for (let index = 1; index < parts.length; index += 1) {
        if (!startupProbeAnswered) {
          startupProbeAnswered = true;
          cursor.setPosition(rows, 1);
          response += `\x1b[${rows};1R`;
          output += `\x1b[${rows};1H`;
        } else if (rendererAttached) {
          output += CURSOR_POSITION_QUERY;
        } else {
          const position = cursor.position();
          response += `\x1b[${position.row};${position.col}R`;
        }
        output += parts[index];
        cursor.consume(parts[index]);
      }
      return {
        output,
        response
      };
    },
    setDimensions(nextCols, nextRows) {
      cols = clampDimension(nextCols, cols, 18, 240);
      rows = clampDimension(nextRows, rows, 4, 80);
      cursor.resize(cols, rows);
    },
    setRows(value) {
      rows = clampDimension(value, rows, 4, 80);
      cursor.resize(cols, rows);
    },
    setRendererAttached(value) {
      rendererAttached = Boolean(value);
    },
    flush() {
      const output = pending;
      pending = "";
      return output;
    }
  };
}

function terminalCursorTracker(initial) {
  let cols = initial.cols;
  let rows = initial.rows;
  let row = 1;
  let col = 1;
  let savedRow = 1;
  let savedCol = 1;
  let scrollTop = 1;
  let scrollBottom = rows;
  let parserPending = "";

  return {
    consume(value) {
      const source = parserPending + String(value || "");
      parserPending = "";
      let index = 0;
      while (index < source.length) {
        const code = source.charCodeAt(index);
        if (code === 0x1b) {
          const parsed = consumeEscape(source, index);
          if (!parsed.complete) {
            parserPending = source.slice(index);
            break;
          }
          applyEscape(parsed);
          index = parsed.next;
          continue;
        }
        if (code === 0x0d) col = 1;
        else if (code === 0x0a) lineFeed();
        else if (code === 0x08) col = Math.max(1, col - 1);
        else if (code === 0x09) col = Math.min(cols, Math.floor((col - 1) / 8 + 1) * 8 + 1);
        else if (code >= 0x20 && code !== 0x7f) advanceColumn();
        index += 1;
      }
    },
    position() {
      return { row, col };
    },
    resize(nextCols, nextRows) {
      cols = nextCols;
      rows = nextRows;
      scrollTop = Math.min(scrollTop, rows);
      scrollBottom = rows;
      row = clamp(row, 1, rows);
      col = clamp(col, 1, cols);
    },
    setPosition(nextRow, nextCol) {
      row = clamp(nextRow, 1, rows);
      col = clamp(nextCol, 1, cols);
    }
  };

  function consumeEscape(source, start) {
    if (start + 1 >= source.length) return { complete: false };
    const second = source[start + 1];
    if (second === "[") {
      for (let cursor = start + 2; cursor < source.length; cursor += 1) {
        const charCode = source.charCodeAt(cursor);
        if (charCode >= 0x40 && charCode <= 0x7e) {
          return {
            complete: true,
            type: "csi",
            params: source.slice(start + 2, cursor),
            final: source[cursor],
            next: cursor + 1
          };
        }
      }
      return { complete: false };
    }
    if (second === "]") {
      const bell = source.indexOf("\x07", start + 2);
      const stringTerminator = source.indexOf("\x1b\\", start + 2);
      const end = bell >= 0 && (stringTerminator < 0 || bell < stringTerminator)
        ? bell + 1
        : stringTerminator >= 0 ? stringTerminator + 2 : -1;
      return end < 0 ? { complete: false } : { complete: true, type: "osc", next: end };
    }
    return { complete: true, type: "esc", final: second, next: start + 2 };
  }

  function applyEscape(sequence) {
    if (sequence.type === "osc") return;
    if (sequence.type === "esc") {
      if (sequence.final === "M") row = row === scrollTop ? row : Math.max(1, row - 1);
      if (sequence.final === "7") {
        savedRow = row;
        savedCol = col;
      }
      if (sequence.final === "8") {
        row = savedRow;
        col = savedCol;
      }
      if (sequence.final === "c") {
        row = 1;
        col = 1;
        scrollTop = 1;
        scrollBottom = rows;
      }
      return;
    }
    const clean = sequence.params.replace(/^[?!>]/, "");
    const params = clean.split(";").map((value) => Number(value) || 0);
    const first = params[0] || 1;
    const second = params[1] || 1;
    if (sequence.final === "H" || sequence.final === "f") {
      row = clamp(first, 1, rows);
      col = clamp(second, 1, cols);
    } else if (sequence.final === "A") row = clamp(row - first, 1, rows);
    else if (sequence.final === "B" || sequence.final === "e") row = clamp(row + first, 1, rows);
    else if (sequence.final === "C" || sequence.final === "a") col = clamp(col + first, 1, cols);
    else if (sequence.final === "D") col = clamp(col - first, 1, cols);
    else if (sequence.final === "E") {
      row = clamp(row + first, 1, rows);
      col = 1;
    } else if (sequence.final === "F") {
      row = clamp(row - first, 1, rows);
      col = 1;
    } else if (sequence.final === "G" || sequence.final === "`") col = clamp(first, 1, cols);
    else if (sequence.final === "d") row = clamp(first, 1, rows);
    else if (sequence.final === "s") {
      savedRow = row;
      savedCol = col;
    } else if (sequence.final === "u") {
      row = savedRow;
      col = savedCol;
    } else if (sequence.final === "r") {
      scrollTop = clamp(params[0] || 1, 1, rows);
      scrollBottom = clamp(params[1] || rows, scrollTop, rows);
      row = 1;
      col = 1;
    }
  }

  function advanceColumn() {
    if (col >= cols) {
      col = 1;
      lineFeed();
      return;
    }
    col += 1;
  }

  function lineFeed() {
    if (row < scrollBottom) row += 1;
  }
}

function trailingQueryPrefixLength(value) {
  const max = Math.min(value.length, CURSOR_POSITION_QUERY.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (CURSOR_POSITION_QUERY.startsWith(value.slice(-length))) return length;
  }
  return 0;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clampDimension(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}
