export const POST_UPDATE_CHANGELOG_STORAGE_KEY = "vibyra.desktop.postUpdateChangelog";

export interface PostUpdateChangelogReceipt {
  pendingVersion: string | null;
  seenVersion: string | null;
}

interface ReceiptStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const EMPTY_RECEIPT: PostUpdateChangelogReceipt = {
  pendingVersion: null,
  seenVersion: null,
};
const seenThisSession = new Set<string>();

function browserStorage(): ReceiptStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function version(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readPostUpdateChangelogReceipt(
  storage: ReceiptStorage | null = browserStorage(),
): PostUpdateChangelogReceipt {
  if (!storage) return { ...EMPTY_RECEIPT };
  try {
    const raw: unknown = JSON.parse(
      storage.getItem(POST_UPDATE_CHANGELOG_STORAGE_KEY) ?? "null",
    );
    if (!raw || typeof raw !== "object") return { ...EMPTY_RECEIPT };
    const receipt = raw as Partial<PostUpdateChangelogReceipt>;
    return {
      pendingVersion: version(receipt.pendingVersion),
      seenVersion: version(receipt.seenVersion),
    };
  } catch {
    return { ...EMPTY_RECEIPT };
  }
}

function writeReceipt(receipt: PostUpdateChangelogReceipt, storage: ReceiptStorage | null) {
  if (!storage) return false;
  try {
    storage.setItem(POST_UPDATE_CHANGELOG_STORAGE_KEY, JSON.stringify(receipt));
    return true;
  } catch {
    return false;
  }
}

/** Records the signed target immediately before installation. Persistence is
 * best-effort: release installation must never depend on changelog storage. */
export function markPostUpdateChangelogPending(
  targetVersion: string,
  storage: ReceiptStorage | null = browserStorage(),
): boolean {
  const pendingVersion = version(targetVersion);
  if (!pendingVersion) return false;
  const current = readPostUpdateChangelogReceipt(storage);
  return writeReceipt({ ...current, pendingVersion }, storage);
}

export function shouldShowPostUpdateChangelog(
  currentVersion: string,
  storage: ReceiptStorage | null = browserStorage(),
  allowUnmarkedLaunch = false,
): boolean {
  const installedVersion = version(currentVersion);
  if (!installedVersion || seenThisSession.has(installedVersion)) return false;
  const receipt = readPostUpdateChangelogReceipt(storage);
  const pendingUpdate = receipt.pendingVersion === installedVersion;
  const firstAdoption = allowUnmarkedLaunch && receipt.pendingVersion === null;
  return (pendingUpdate || firstAdoption) && receipt.seenVersion !== installedVersion;
}

export function rememberPostUpdateChangelog(
  currentVersion: string,
  storage: ReceiptStorage | null = browserStorage(),
): boolean {
  const seenVersion = version(currentVersion);
  if (!seenVersion) return false;
  seenThisSession.add(seenVersion);
  const current = readPostUpdateChangelogReceipt(storage);
  return writeReceipt({
    pendingVersion: current.pendingVersion === seenVersion ? null : current.pendingVersion,
    seenVersion,
  }, storage);
}
