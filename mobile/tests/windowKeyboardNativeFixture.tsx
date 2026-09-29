// Native proof for typing into a computer app's window Preview: the real
// PreviewWebView in native-window mode, pointed at a local stand-in for the
// Mac (scripts/window-keyboard-fake-mac.mjs). Driven by
// scripts/verify-window-keyboard-ios.mjs.
import { registerRootComponent } from 'expo';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PreviewWebView } from '../src/preview/PreviewWebView';

const mac = 'http://127.0.0.1:47900';

function WindowKeyboardFixture() {
  return <SafeAreaProvider>
    <View style={{ flex: 1, backgroundColor: '#0d0e12' }}>
      <PreviewWebView nativeWindow startUrl={`${mac}/`} label="Staff sign in" onClose={() => {
        void fetch(`${mac}/fixture-closed`, { method: 'POST' });
      }} />
    </View>
  </SafeAreaProvider>;
}

registerRootComponent(WindowKeyboardFixture);
