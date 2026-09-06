import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Vibyra', slug: 'vibyra', version: '1.0.0', scheme: 'vibyra',
  orientation: 'default', userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.vibyra.mobile', supportsTablet: false,
    infoPlist: {
      NSLocalNetworkUsageDescription: 'Connect securely to your computer to run your development sessions.',
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      ITSAppUsesNonExemptEncryption: true,
    },
  },
  android: { package: 'app.vibyra.mobile' },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-secure-store',
    ['expo-camera', { cameraPermission: 'Scan the pairing code shown on your computer.', recordAudioAndroid: false }],
    ['expo-dev-client', { launchMode: 'most-recent' }],
  ],
  extra: { remoteProtocol: 1 },
};
export default config;
