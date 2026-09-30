import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// On an iPhone, Sign in with Apple is Apple's own sheet (ASAuthorizationController), never
// Apple's web page. Use a Vibyra build with its Sign in with Apple entitlement.
// Check the module itself: Expo Go availability varies between installed builds.
export const appleSheet =
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoAppleAuthentication') !== null;
export const appleSheetMissing =
  'Open the Vibyra app to continue with Apple. This preview does not support Apple sign-in.';

/** Why the sheet failed, in words a person can act on. Null when they cancelled it. */
export function appleSheetError(error: unknown): Error | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'ERR_REQUEST_CANCELED') return null;
  // ASAuthorizationError.unknown: the iPhone has no Apple Account, or the build lacks the entitlement.
  if (code === 'ERR_REQUEST_UNKNOWN')
    return new Error(
      'Apple couldn’t sign you in. Check your iPhone is signed in to your Apple Account in Settings, then try again.',
    );
  return error instanceof Error
    ? error
    : new Error('Apple couldn’t sign you in. Please try again.');
}
