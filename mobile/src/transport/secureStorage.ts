import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore accepts only letters, digits, ".", "-" and "_" in a key. Callers
 * build keys from account emails and ids, so anything else is escaped here, once,
 * as "_" plus the character's hex code. "_" escapes itself, so two different
 * keys can never land on the same entry. A key that is already clean is unchanged.
 */
export const secureKey = (key: string): string =>
  key.replace(/[^A-Za-z0-9.-]/g, (char) => `_${char.codePointAt(0)!.toString(16)}`);

const name = (key: string) => secureKey(`vibyra.remote.v1.${key}`);

export const readSecure = (key: string) => SecureStore.getItemAsync(name(key));
export const writeSecure = (key: string, value: string) =>
  SecureStore.setItemAsync(name(key), value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
export const deleteSecure = (key: string) => SecureStore.deleteItemAsync(name(key));
