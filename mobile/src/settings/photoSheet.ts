import { ActionSheetIOS, Platform } from 'react-native';

/** The system's own action sheet where there is one (iOS). Elsewhere null, and the
 *  photo control draws its own short menu instead. */
export const photoSheet = Platform.OS === 'ios' ? ActionSheetIOS.showActionSheetWithOptions : null;
