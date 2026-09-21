import { Share } from 'react-native';

/**
 * Somewhere other than this screen for a set of recovery codes to live: the phone's
 * own share sheet, which is where Notes, Files, a password manager and printing all
 * are. Nothing is sent anywhere by us — the sheet hands the text to whatever the
 * person picks, and false simply means they picked nothing.
 */
export async function keepText(title: string, text: string): Promise<boolean> {
  try {
    const result = await Share.share({ title, message: text });
    return result.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}
