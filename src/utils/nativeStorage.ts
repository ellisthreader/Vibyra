import AsyncStorage from "@react-native-async-storage/async-storage";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

function getWebStorage(): StorageLike | null {
  return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
}

export function readStorageItemSync(key: string): string | null {
  return getWebStorage()?.getItem(key) ?? null;
}

export async function readStorageItem(key: string): Promise<string | null> {
  const webStorage = getWebStorage();
  if (webStorage) return webStorage.getItem(key);
  return AsyncStorage.getItem(key);
}

export async function writeStorageItem(key: string, value: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}
