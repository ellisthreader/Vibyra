export type StorageAdapter = { read: () => Promise<string | null>; write: (value: string) => Promise<void> };
export type SecretStorageAdapter = StorageAdapter & { delete: () => Promise<void> };
type DesktopSecret = { url: string; pairCode: string; token: string };
export type PersistedSecrets = { authToken: string; desktopTokens: DesktopSecret[] };
const EMPTY_SECRETS: PersistedSecrets = { authToken: "", desktopTokens: [] };
export function createSecretSessionPersistence(
  publicStorage: StorageAdapter,
  secretStorage: SecretStorageAdapter
) {
  let writeQueue = Promise.resolve();
  function enqueue(operation: () => Promise<void>): Promise<boolean> {
    const queued = writeQueue.then(operation);
    writeQueue = queued.then(() => undefined, () => undefined);
    return queued.then(() => true, () => false);
  }
  function updateSecrets(update: (secrets: PersistedSecrets) => PersistedSecrets): Promise<boolean> {
    return enqueue(async () => {
      const secrets = await readSecretsStrict(secretStorage);
      await writeVerifiedSecrets(secretStorage, update(secrets));
    });
  }
  return {
    async load(): Promise<unknown | null> {
      const raw = await publicStorage.read();
      if (!raw) return null;
      const publicValue = JSON.parse(raw) as unknown;
      const legacySecrets = extractPersistedSecrets(publicValue);
      const storedSecrets = await readSecrets(secretStorage);
      const secrets = mergeSecretStates(legacySecrets, storedSecrets);
      if (hasSecrets(legacySecrets)) {
        try {
          await writeVerifiedSecrets(secretStorage, secrets);
          const sanitized = sanitizePersistedSession(publicValue);
          await publicStorage.write(JSON.stringify(sanitized));
          return mergePersistedSecrets(sanitized, secrets);
        } catch {
          return mergePersistedSecrets(publicValue, secrets);
        }
      }
      return mergePersistedSecrets(publicValue, storedSecrets);
    },
    save(value: unknown): Promise<boolean> {
      return enqueue(async () => {
        const secrets = extractPersistedSecrets(value);
        await writeVerifiedSecrets(secretStorage, secrets);
        await publicStorage.write(JSON.stringify(sanitizePersistedSession(value)));
      });
    },
    clearAllSecrets: () => enqueue(() => writeVerifiedSecrets(secretStorage, EMPTY_SECRETS)),
    clearAuthToken: () => updateSecrets((secrets) => ({ ...secrets, authToken: "" })),
    clearDesktopTokens: () => updateSecrets((secrets) => ({ ...secrets, desktopTokens: [] }))
  };
}
export function extractPersistedSecrets(value: unknown): PersistedSecrets {
  const record = asRecord(value);
  const desktopTokens: DesktopSecret[] = [];
  collectDesktopSecrets(value, desktopTokens);
  return normalizeSecrets({
    authToken: typeof record?.authToken === "string" ? record.authToken : "",
    desktopTokens
  });
}
export function sanitizePersistedSession(value: unknown): unknown {
  const record = asRecord(value);
  if (!record) return value;
  return sanitizeRecord(record, true);
}
export function mergePersistedSecrets(value: unknown, secrets: PersistedSecrets): unknown {
  const sanitized = sanitizePersistedSession(value);
  const record = asRecord(sanitized);
  if (!record) return sanitized;
  const merged = mergeDesktopTokens(record, secrets.desktopTokens);
  return secrets.authToken ? { ...merged, authToken: secrets.authToken } : merged;
}
async function readSecrets(adapter: SecretStorageAdapter): Promise<PersistedSecrets> {
  try {
    return await readSecretsStrict(adapter);
  } catch {
    return EMPTY_SECRETS;
  }
}
async function readSecretsStrict(adapter: SecretStorageAdapter): Promise<PersistedSecrets> {
  const raw = await adapter.read();
  return raw ? normalizeSecrets(JSON.parse(raw)) : EMPTY_SECRETS;
}
async function writeVerifiedSecrets(adapter: SecretStorageAdapter, secrets: PersistedSecrets) {
  if (!hasSecrets(secrets)) {
    await adapter.delete();
    if (await adapter.read() !== null) throw new Error("Secret deletion verification failed");
    return;
  }
  const serialized = JSON.stringify(normalizeSecrets(secrets));
  await adapter.write(serialized);
  const verified = await adapter.read();
  if (!verified || !secretsEqual(JSON.parse(verified), secrets)) {
    throw new Error("Secret write verification failed");
  }
}
function collectDesktopSecrets(value: unknown, output: DesktopSecret[]) {
  if (Array.isArray(value)) {
    value.forEach((child) => collectDesktopSecrets(child, output));
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  if (Array.isArray(record.rememberedDesktops)) {
    for (const item of record.rememberedDesktops) {
      const desktop = asRecord(item);
      const url = stringValue(desktop?.url);
      const pairCode = stringValue(desktop?.pairCode).toUpperCase();
      const token = stringValue(desktop?.token);
      if (url && pairCode && token) output.push({ url, pairCode, token });
    }
  }
  Object.values(record).forEach((child) => collectDesktopSecrets(child, output));
}
function sanitizeRecord(value: Record<string, unknown>, root = false): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    if (root && key === "authToken") return [];
    if (key === "rememberedDesktops" && Array.isArray(child)) {
      return [[key, child.map(sanitizeRememberedDesktop)]];
    }
    if (Array.isArray(child)) return [[key, child.map(sanitizeNestedValue)]];
    const record = asRecord(child);
    return [[key, record ? sanitizeRecord(record) : child]];
  }));
}
function sanitizeRememberedDesktop(value: unknown): unknown {
  const desktop = asRecord(value);
  if (!desktop) return value;
  return Object.fromEntries(Object.entries(desktop).flatMap(([key, child]) =>
    key === "token" ? [] : [[key, sanitizeNestedValue(child)]]
  ));
}
function sanitizeNestedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeNestedValue);
  const record = asRecord(value);
  return record ? sanitizeRecord(record) : value;
}
function mergeDesktopTokens(value: Record<string, unknown>, tokens: DesktopSecret[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === "rememberedDesktops" && Array.isArray(child)) {
      return [key, child.map((item) => {
        const desktop = asRecord(item);
        if (!desktop) return item;
        const token = tokens.find((secret) =>
          secret.url === stringValue(desktop.url)
          && secret.pairCode === stringValue(desktop.pairCode).toUpperCase()
        )?.token;
        return token ? { ...desktop, token } : desktop;
      })];
    }
    const record = asRecord(child);
    if (record) return [key, mergeDesktopTokens(record, tokens)];
    if (Array.isArray(child)) {
      return [key, child.map((item) => {
        const itemRecord = asRecord(item);
        return itemRecord ? mergeDesktopTokens(itemRecord, tokens) : item;
      })];
    }
    return [key, child];
  }));
}
function mergeSecretStates(legacy: PersistedSecrets, stored: PersistedSecrets) {
  return normalizeSecrets({
    authToken: stored.authToken || legacy.authToken,
    desktopTokens: [...stored.desktopTokens, ...legacy.desktopTokens]
  });
}
function normalizeSecrets(value: unknown): PersistedSecrets {
  const record = asRecord(value);
  const seen = new Set<string>();
  const desktopTokens = Array.isArray(record?.desktopTokens)
    ? record.desktopTokens.flatMap((item): DesktopSecret[] => {
        const desktop = asRecord(item);
        const url = stringValue(desktop?.url);
        const pairCode = stringValue(desktop?.pairCode).toUpperCase();
        const token = stringValue(desktop?.token);
        const key = `${url}:${pairCode}`;
        if (!url || !pairCode || !token || seen.has(key)) return [];
        seen.add(key);
        return [{ url, pairCode, token }];
      })
    : [];
  return { authToken: stringValue(record?.authToken), desktopTokens };
}
function secretsEqual(left: unknown, right: PersistedSecrets) {
  return JSON.stringify(normalizeSecrets(left)) === JSON.stringify(normalizeSecrets(right));
}
function hasSecrets(value: PersistedSecrets) {
  return Boolean(value.authToken || value.desktopTokens.length);
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
