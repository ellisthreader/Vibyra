import * as SecureStore from 'expo-secure-store';

export const readSecure = (key: string) => SecureStore.getItemAsync(`vibyra.remote.v1.${key}`);
export const writeSecure = (key: string, value: string) => SecureStore.setItemAsync(`vibyra.remote.v1.${key}`, value, {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
});
export const deleteSecure = (key: string) => SecureStore.deleteItemAsync(`vibyra.remote.v1.${key}`);
