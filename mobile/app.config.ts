import type { ExpoConfig } from 'expo/config';

const CAMERA = 'Scan the pairing code on your computer, and take photos to share in a chat or use as your profile picture.';
const DEFAULT_API_URL = 'https://vibyra-production.up.railway.app';
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
const passkeyOrigin = process.env.EXPO_PUBLIC_PASSKEY_ORIGIN ?? new URL(apiUrl).origin;
const passkeyUrl = new URL(passkeyOrigin);
if (passkeyUrl.origin !== passkeyOrigin || (passkeyUrl.protocol !== 'https:' &&
  !(passkeyUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(passkeyUrl.hostname)))) {
  throw new Error('EXPO_PUBLIC_PASSKEY_ORIGIN must be an HTTPS origin (loopback HTTP is allowed for development).');
}

// Local Expo and fixture sessions may point at a LAN/loopback backend. A
// distribution archive must never bake an insecure account/analytics API URL.
if (process.env.EXPO_PUBLIC_PUSH_ENVIRONMENT === 'production') {
  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error('Production EXPO_PUBLIC_API_URL must be an HTTPS URL.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error('Production EXPO_PUBLIC_API_URL must be an HTTPS URL without credentials.');
  }
}

const config: ExpoConfig = {
  name: 'Vibyra', slug: 'vibyra', version: '1.0.0', scheme: 'vibyra',
  orientation: 'default', userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.vibyra.mobile', appleTeamId: '6WXKN5P8K5', buildNumber: '11', supportsTablet: false, usesAppleSignIn: true,
    infoPlist: {
      NSLocalNetworkUsageDescription: 'Find your computer running Vibyra Host on the same Wi-Fi so you can connect to it.',
      NSBonjourServices: ['_vibyra-host._tcp'],
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      NSSpeechRecognitionUsageDescription: 'Turn what you say into text in your message. Voice recognition stays on this iPhone.',
      // Apple determined no export document is required for the current
      // distribution plan, which excludes France.
      ITSAppUsesNonExemptEncryption: false,
      // iOS answers "not installed" for any scheme not named here, so Settings >
      // Two-factor can only offer "Set up in 1Password" for apps on this list. The
      // setup link itself is always otpauth:, which every authenticator claims.
      LSApplicationQueriesSchemes: ['otpauth', 'onepassword', 'bitwarden', 'authy', 'msauth',
        'twofas', 'enteauth', 'raivo-otp', 'aegis'],
    },
  },
  android: { package: 'app.vibyra.mobile' },
  web: { bundler: 'metro', output: 'single' },
  experiments: { baseUrl: process.env.VIBYRA_WEB_BASE_PATH ?? '' },
  plugins: [
    'expo-notifications',
    'expo-apple-authentication',
    'expo-web-browser',
    'expo-secure-store',
    'expo-font',
    'expo-asset',
    'expo-video',
    // One camera sentence for every use, because iOS keeps a single one and the last
    // plugin to set it would otherwise decide which feature the prompt describes.
    ['expo-camera', { cameraPermission: CAMERA, recordAudioAndroid: false,
      // The chat's voice input is what uses the microphone; the camera never records sound.
      microphonePermission: 'Talk to Vibyra instead of typing. What you say becomes text in your message.' }],
    ['expo-image-picker', { cameraPermission: CAMERA, microphonePermission: false,
      photosPermission: 'Choose photos to share in a chat or to use as your profile picture.' }],
    ['expo-dev-client', { launchMode: 'most-recent' }],
  ],
  extra: { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? process.env.EAS_BUILD_PROJECT_ID }, pushEnvironment: process.env.EXPO_PUBLIC_PUSH_ENVIRONMENT ?? 'development', remoteProtocol: 1, apiUrl, passkeyOrigin, webBasePath: process.env.VIBYRA_WEB_BASE_PATH ?? '' },
};
export default config;
