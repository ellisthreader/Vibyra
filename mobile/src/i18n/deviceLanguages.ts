import { NativeModules, Platform } from 'react-native';

/** The person's languages in order of preference, as the platform reports them. */
export function deviceLanguages(): readonly string[] {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined')
      return navigator.languages?.length ? navigator.languages : [navigator.language];
    const apple = NativeModules.SettingsManager?.settings?.AppleLanguages;
    if (Array.isArray(apple) && apple.length) return apple.map(String);
    return [Intl.DateTimeFormat().resolvedOptions().locale];
  } catch {
    return [];
  }
}
