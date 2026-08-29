/* Git's unified diff, read into hunks.
 *
 * The old view coloured by first character. That is enough to tint a line and
 * nothing more: line numbers, collapsed context and word-level marks all need
 * to know where a line sits in the file, and only the `@@` header plus a
 * running count knows that. Parsing also settles what the character test gets
 * wrong — inside a hunk body `---` is a deleted `--`, not a file header, and a
 * `--3way` conflict marker is ordinary content. A hunk body is bounded by the
 * counts its header declares, so nothing inside one is ever read as structure.
 *
 * The reader is handed one file's diff at a time, so `meta` describes the
 * first header it sees; hunks from any later file simply continue the list. */

export type DiffLineKind = "add" | "del" | "context";

export interface DiffLine {
  kind: DiffLineKind;
  /** Content with git's prefix character removed. */
  text: string;
  /** 1-based line number in the old file, or null on an addition. */
  oldNumber: number | null;
  /** 1-based line number in the new file, or null on a deletion. */
  newNumber: number | null;
  /** git printed `\ No newline at end of file` directly after this line. */
  noNewline: boolean;
}

export interface DiffHunk {
  /** The raw `@@` line, kept verbatim for the header row. */
  header: string;
  /** The section hint git appends after the second `@@`, trimmed. */
  heading: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffMeta {
  oldPath: string | null;
  newPath: string | null;
  renamed: boolean;
  binary: boolean;
  additions: number;
  deletions: number;
  /** Lines outside every hunk that are not a header git wrote — a binary
   *  notice, or whatever the caller handed us when it could not read a diff.
   *  The view shows them when there is nothing else to show. */
  notes: string[];
}

export interface ParsedDiff {
  meta: DiffMeta;
  hunks: DiffHunk[];
}

const HUNK = /^@@+ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@+(.*)$/;

/** Header lines that carry no reading value once the paths are known. */
const QUIET_HEADERS = [
  "diff --git ",
  "diff --cc ",
  "diff --combined ",
  "index ",
  "old mode ",
  "new mode ",
  "new file mode ",
  "deleted file mode ",
  "similarity index ",
  "dissimilarity index ",
  "copy from ",
  "copy to ",
];

function withoutSide(path: string): string | null {
  const tab = path.indexOf("\t");
  const clean = tab === -1 ? path : path.slice(0, tab);
  return clean === "/dev/null" ? null : clean.replace(/^[ab]\//, "");
}

function readHeader(meta: DiffMeta, line: string): void {
  if (line.startsWith("--- ")) meta.oldPath = withoutSide(line.slice(4));
  else if (line.startsWith("+++ ")) meta.newPath = withoutSide(line.slice(4));
  else if (line.startsWith("rename from ")) {
    meta.oldPath = line.slice(12);
    meta.renamed = true;
  } else if (line.startsWith("rename to ")) {
    meta.newPath = line.slice(10);
    meta.renamed = true;
  } else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
    meta.binary = true;
    meta.notes.push(line);
  } else if (line !== "" && !QUIET_HEADERS.some((prefix) => line.startsWith(prefix))) {
    meta.notes.push(line);
  }
}

function emptyMeta(): DiffMeta {
  return {
    oldPath: null,
    newPath: null,
    renamed: false,
    binary: false,
    additions: 0,
    deletions: 0,
    notes: [],
  };
}

export function parseDiff(text: string): ParsedDiff {
  const meta = emptyMeta();
  const hunks: DiffHunk[] = [];
  if (!text) return { meta, hunks };

  let hunk: DiffHunk | null = null;
  let oldLeft = 0;
  let newLeft = 0;
  let oldAt = 0;
  let newAt = 0;

  for (const source of text.split("\n")) {
    // One trailing CR, dropped: a diff of a CRLF file otherwise renders a
    // stray glyph at the end of every single line.
    const line = source.endsWith("\r") ? source.slice(0, -1) : source;

    // The no-newline marker follows the last line of a hunk, which by then has
    // already spent the header's counts — so it is read before they are tested.
    if (hunk && line.startsWith("\\")) {
      const last = hunk.lines[hunk.lines.length - 1];
      if (last) last.noNewline = true;
      continue;
    }

    if (hunk && (oldLeft > 0 || newLeft > 0)) {
      const mark = line.charAt(0);
      if (mark === "+" && newLeft > 0) {
        newAt += 1;
        newLeft -= 1;
        meta.additions += 1;
        hunk.lines.push({ kind: "add", text: line.slice(1), oldNumber: null, newNumber: newAt, noNewline: false });
      } else if (mark === "-" && oldLeft > 0) {
        oldAt += 1;
        oldLeft -= 1;
        meta.deletions += 1;
        hunk.lines.push({ kind: "del", text: line.slice(1), oldNumber: oldAt, newNumber: null, noNewline: false });
      } else {
        oldAt += 1;
        newAt += 1;
        oldLeft = Math.max(0, oldLeft - 1);
        newLeft = Math.max(0, newLeft - 1);
        const text_ = mark === " " ? line.slice(1) : line;
        hunk.lines.push({ kind: "context", text: text_, oldNumber: oldAt, newNumber: newAt, noNewline: false });
      }
      continue;
    }

    hunk = null;
    const found = HUNK.exec(line);
    if (!found) {
      readHeader(meta, line);
      continue;
    }
    oldAt = Number(found[1]) - 1;
    newAt = Number(found[3]) - 1;
    oldLeft = found[2] === undefined ? 1 : Number(found[2]);
    newLeft = found[4] === undefined ? 1 : Number(found[4]);
    hunk = {
      header: line,
      heading: found[5].trim(),
      oldStart: Number(found[1]),
      oldCount: oldLeft,
      newStart: Number(found[3]),
      newCount: newLeft,
      lines: [],
    };
    hunks.push(hunk);
  }

  return { meta, hunks };
}
