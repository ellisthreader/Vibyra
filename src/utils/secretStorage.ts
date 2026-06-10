import * as SecureStore from "expo-secure-store";

import type { SecretStorageAdapter } from "./persistenceSecrets";

const SECRET_KEY = "vibyra.secrets.v1";

export const secretStorage: SecretStorageAdapter = {
  read: () => SecureStore.getItemAsync(SECRET_KEY),
  write: (value) => SecureStore.setItemAsync(SECRET_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  }),
  delete: () => SecureStore.deleteItemAsync(SECRET_KEY)
};
