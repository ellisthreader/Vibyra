import { computerName } from "./platform.ts";
// Which fenced block in a reply may be offered a Run button, and whether
// running it should stop for a confirmation first. Pure — no IPC, no React —
// so the entire gate is unit-testable and the effectful half stays dumb.

const SHELL_TAGS = new Set([
  "bash", "sh", "shell", "zsh", "console", "shell-session", "sh-session", "terminal",
]);
/** Tags that usually hold a transcript: prompted commands plus their output. */
const TRANSCRIPT_TAGS = new Set(["console", "shell-session", "sh-session"]);
const PROMPT = /^\s*(?:\$|%|>|❯|PS [^>]*>)\s+/;
/** Every control character but \n and \t. An ESC or BEL here is a
 *  terminal-injection payload rather than a command, and a bare \r would
 *  submit whatever precedes it before anyone has read the rest. */
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/;
const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;
const MAX_LINES = 12;
const MAX_CHARS = 2_000;

export interface RunnableCommand {
  lines: string[];
}

export interface DangerVerdict {
  confirm: boolean;
  reasons: string[];
}

/** The lines a Run button would type, or null when the block is not a command
 *  block at all. Null means the block keeps Copy and loses Run. */
export function parseRunnable(language: string, code: string): RunnableCommand | null {
  // An untagged fence is never runnable: the prompt asks the model to tag
  // `bash`, and a Run button on an untagged block would happily type a JSON
  // blob at a shell prompt.
  const tag = language.trim().toLowerCase();
  if (!SHELL_TAGS.has(tag)) return null;
  const text = code.replace(/\r\n/g, "\n");
  if (text.length > MAX_CHARS || CONTROL.test(text)) return null;
  let lines = text.split("\n").filter((line) => line.trim() !== "");
  // In a transcript the unprompted lines are output, not something to run.
  if (TRANSCRIPT_TAGS.has(tag) && lines.some((line) => PROMPT.test(line))) {
    lines = lines.filter((line) => PROMPT.test(line));
  }
  lines = lines
    .map((line) => line.replace(PROMPT, "").trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  if (lines.length === 0 || lines.length > MAX_LINES) return null;
  return unterminatedHeredoc(lines) ? null : { lines };
}

/** `cat <<EOF` with no closing `EOF` would swallow whatever is typed next. */
function unterminatedHeredoc(lines: string[]): boolean {
  for (let at = 0; at < lines.length; at += 1) {
    const match = HEREDOC.exec(lines[at]);
    if (match && !lines.slice(at + 1).some((line) => line.trim() === match[2])) return true;
  }
  return false;
}

const DISCARD = "This discards uncommitted work.";
const REWRITE = "This rewrites the project's history.";
const HIDDEN = "What this actually runs is not visible here.";
const OUTSIDE = "This reaches files outside this project.";
const GLOBAL = "This installs outside this project.";

const DESTRUCTIVE: Record<string, string> = {
  rm: "This deletes files.", rmdir: "This deletes files.", shred: "This deletes files.",
  dd: "This writes straight to a disk.", mkfs: "This writes straight to a disk.",
  chown: "This changes who owns files.", chmod: "This changes file permissions.",
  kill: "This stops a running program.", killall: "This stops a running program.",
  pkill: "This stops a running program.",
  reboot: `This restarts this ${computerName}.`, shutdown: `This shuts this ${computerName} down.`,
  launchctl: `This changes how this ${computerName} is set up.`,
  systemctl: `This changes how this ${computerName} is set up.`,
  diskutil: `This changes how this ${computerName} is set up.`,
  defaults: `This changes how this ${computerName} is set up.`,
  crontab: `This changes how this ${computerName} is set up.`,
};
const ELEVATED = new Set(["sudo", "doas"]);
/** Peeled off before reading a segment's program, so `sudo rm` is still `rm`. */
const WRAPPERS = new Set(["env", "sudo", "doas", "time", "nohup", "command", "xargs"]);
const PACKAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const SYSTEM_PATHS = ["/etc", "/usr", "/System", "/Library"];

/**
 * Why this command deserves a confirmation, as short plain sentences. Every
 * rule tokenises: substring matching would fire `rm` on `charm` and `--form`,
 * which is how a gate like this turns into noise people click through.
 */
export function classifyDanger(command: string, root?: string): DangerVerdict {
  const reasons: string[] = [];
  const add = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };
  const lines = command.split("\n").map((line) => line.trim()).filter(Boolean);
  // Multi-line always confirms, benign or not: once the first \r lands the
  // remaining lines are already in the PTY's stdin buffer, so this sheet is
  // the only place they can still be read first.
  if (lines.length > 1) add("More than one command runs, one after another.");
  if (lines.some((line) => line.length > 200)) add("This line is too long to read before running it.");
  if (/\|\s*(sudo\s+)?\w*sh\b/.test(command)) add("This downloads and runs code from the internet.");
  if (/[`]|\$\(|<\(|>\(|\/dev\/tcp\//.test(command)) add(HIDDEN);
  if (/(?:^|\s)(?:PATH|LD_PRELOAD|DYLD_[A-Z_]*)=/.test(command)) {
    add("This changes where programs are loaded from.");
  }
  for (const segment of command.split(/\n|;|&&|\|\||\|/)) inspect(segment.trim(), root, add);
  return { confirm: reasons.length > 0, reasons };
}

function inspect(segment: string, root: string | undefined, add: (reason: string) => void): void {
  if (!segment) return;
  const tokens = segment.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (ELEVATED.has(token)) add("This runs as an administrator.");
    if (outsideProject(token, root)) add(OUTSIDE);
  }
  // `-` / `=` / `<` before the arrow keeps `->` and `=>` out of this.
  for (const match of segment.matchAll(/(?<![-=<>])>>?\s*([^\s;&|]*)/g)) {
    const target = match[1];
    // `&1` duplicates a descriptor and `(` opens a process substitution, which
    // the hidden-command rule above already speaks for.
    if (target && !/^[&(]/.test(target) && target !== "/dev/null") add("This overwrites a file.");
  }
  let at = 0;
  while (at < tokens.length && (WRAPPERS.has(tokens[at]) || /^[A-Za-z_]\w*=/.test(tokens[at]))) at += 1;
  const program = tokens[at]?.split("/").pop() ?? "";
  const rest = tokens.slice(at + 1);
  const destructive = DESTRUCTIVE[program];
  if (destructive) add(destructive);
  if (program === "mv") add("This moves files.");
  if (program === "cp" && rest.some((token) => /^-\w*[rRf]/.test(token))) {
    add("This copies over files that are already there.");
  }
  if (program === "find" && rest.some((token) => token === "-delete" || token === "-exec")) {
    add("This runs something for every file it finds.");
  }
  if ((program === "curl" || program === "wget") && rest.some(downloads)) {
    add(`This downloads a file onto this ${computerName}.`);
  }
  if (program === "git") inspectGit(rest, add);
  if (PACKAGERS.has(program)) inspectPackager(rest, add);
}

function downloads(token: string): boolean {
  return token === "--output" || /^-[a-zA-Z]*[oO]$/.test(token);
}

function inspectGit(rest: string[], add: (reason: string) => void): void {
  const [verb, ...args] = rest;
  const has = (flag: string) => args.includes(flag);
  if (verb === "clean" || verb === "restore") add(DISCARD);
  if (verb === "reset" && has("--hard")) add(DISCARD);
  if (verb === "checkout" && (has("-f") || has("--force") || has("."))) add(DISCARD);
  if (verb === "stash" && (args[0] === "drop" || args[0] === "clear")) add(DISCARD);
  if (verb === "rebase" || verb === "filter-branch") add(REWRITE);
  if (verb === "branch" && has("-D")) add(REWRITE);
  if (verb === "worktree" && args[0] === "remove") add(REWRITE);
  if (verb === "push" && (has("-f") || has("--force") || has("--force-with-lease"))) {
    add("This overwrites a branch other people may have.");
  }
}

function inspectPackager(rest: string[], add: (reason: string) => void): void {
  const verb = rest[0];
  if (verb === "publish" || verb === "unpublish") add("This publishes a package publicly.");
  if (verb === "link" || verb === "global") add(GLOBAL);
  const installing = verb === "install" || verb === "i" || verb === "add";
  if (installing && rest.some((token) => token === "-g" || token === "--global")) add(GLOBAL);
}

/** `/dev/null` is the one absolute path a benign command routinely names. */
function outsideProject(token: string, root?: string): boolean {
  const path = token.replace(/^["']|["']$/g, "");
  if (path === "/dev/null") return false;
  if (path.startsWith("~/")) return true;
  if (!path.startsWith("/")) return false;
  if (SYSTEM_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return true;
  return !root || !(path === root || path.startsWith(`${root}/`));
}
