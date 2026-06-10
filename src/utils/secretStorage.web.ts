import type { SecretStorageAdapter } from "./persistenceSecrets";

const SECRET_KEY = "vibyra.secrets.v1";

function storage() {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

export const secretStorage: SecretStorageAdapter = {
  read: async () => storage()?.getItem(SECRET_KEY) ?? null,
  write: async (value) => {
    storage()?.setItem(SECRET_KEY, value);
  },
  delete: async () => {
    storage()?.removeItem(SECRET_KEY);
  }
};
