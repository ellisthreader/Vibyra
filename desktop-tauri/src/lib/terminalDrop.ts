/**
 * Dropping a file into a terminal types its path, the way every native
 * terminal does. The same helpers serve the screenshot tray's own drag, so a
 * thumbnail dropped on a pane and a file dropped from the desktop insert the
 * identical quoted path.
 */

/** Wraps a path so a shell reads it as a single argument. */
export function shellQuotePath(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/**
 * `file://` URI for a local path. `:` is left unencoded so a Windows drive
 * letter still reads as `file:///C:/…`; everything else outside the URI
 * unreserved set is percent-encoded.
 */
export function fileUri(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const rooted = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const encoded = rooted
    .split("/")
    .map((segment) => encodeURIComponent(segment).replaceAll("%3A", ":"))
    .join("/");
  return `file://${encoded}`;
}

function pathFromFileUri(uri: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(uri).pathname);
  } catch {
    return null;
  }
  // file:///C:/… — the leading slash is part of the URI, not of the path.
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  return path || null;
}

/** The dropped file paths, in the order the source listed them. */
export function droppedPaths(uriList: string): string[] {
  return uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    // A uri-list may carry `#` comment lines; only file URIs name something a
    // terminal can open.
    .filter((line) => line.toLowerCase().startsWith("file://"))
    .map(pathFromFileUri)
    .filter((path): path is string => path !== null);
}

/** True when a drag carries something a terminal could type. */
export function dropCarriesText(types: readonly string[]): boolean {
  return types.includes("text/uri-list") || types.includes("text/plain") || types.includes("Files");
}

/**
 * What a drop should type into the terminal, or null when it carries nothing
 * usable. Paths get quoted and gain a trailing space so the next argument
 * does not run into them; plain text is typed verbatim.
 */
export function terminalDropText(data: DataTransfer | null): string | null {
  if (!data) return null;
  const paths = droppedPaths(data.getData("text/uri-list"));
  if (paths.length > 0) return `${paths.map(shellQuotePath).join(" ")} `;
  const text = data.getData("text/plain");
  return text.length > 0 ? text : null;
}

/**
 * Without this, a file dropped anywhere but a pane makes the webview navigate
 * to it — the app window would simply become that file, with no way back.
 */
export function installAppDropGuard(): void {
  const allow = (event: DragEvent) => event.preventDefault();
  window.addEventListener("dragover", allow);
  window.addEventListener("drop", allow);
}
