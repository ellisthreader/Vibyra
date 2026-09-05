import {
  extractPersistedSecrets, hasSecrets, mergePersistedSecrets, mergeSecretStates, readSecrets,
  readSecretsStrict, sanitizePersistedSession, writeVerifiedSecrets
} from "./persistenceSecretValues";
import type { PersistedSecrets, SecretStorageAdapter, StorageAdapter } from "./persistenceSecretValues";
import { createPersistenceWriteQueue } from "./persistenceWriteQueue";

export { extractPersistedSecrets, mergePersistedSecrets, sanitizePersistedSession } from "./persistenceSecretValues";
export type { PersistedSecrets, SecretStorageAdapter, StorageAdapter } from "./persistenceSecretValues";

export function createSecretSessionPersistence(publicStorage: StorageAdapter, secretStorage: SecretStorageAdapter) {
  const queue = createPersistenceWriteQueue<unknown>(async (value) => {
    await writeVerifiedSecrets(secretStorage, extractPersistedSecrets(value));
    await publicStorage.write(JSON.stringify(sanitizePersistedSession(value)));
  });
  function updateSecrets(update: (secrets: PersistedSecrets) => PersistedSecrets) {
    return queue.barrier(async () => {
      const secrets = await readSecretsStrict(secretStorage);
      await writeVerifiedSecrets(secretStorage, update(secrets));
    });
  }
  return {
    async load(): Promise<unknown | null> {
      const raw = await publicStorage.read();
      if (!raw) return null;
      const publicValue = JSON.parse(raw) as unknown;
      const legacy = extractPersistedSecrets(publicValue);
      const stored = await readSecrets(secretStorage);
      if (hasSecrets(legacy)) {
        const secrets = mergeSecretStates(legacy, stored);
        try {
          await writeVerifiedSecrets(secretStorage, secrets);
          const sanitized = sanitizePersistedSession(publicValue);
          await publicStorage.write(JSON.stringify(sanitized));
          return mergePersistedSecrets(sanitized, secrets);
        } catch {
          return mergePersistedSecrets(publicValue, secrets);
        }
      }
      return mergePersistedSecrets(publicValue, stored);
    },
    save: queue.save,
    clearAllSecrets: () => queue.barrier(() => writeVerifiedSecrets(secretStorage, { authToken: "", desktopTokens: [] })),
    clearAuthToken: () => updateSecrets((secrets) => ({ ...secrets, authToken: "" })),
    clearDesktopTokens: () => updateSecrets((secrets) => ({ ...secrets, desktopTokens: [] }))
  };
}
