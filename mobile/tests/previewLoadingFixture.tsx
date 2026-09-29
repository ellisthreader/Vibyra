import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { palettes, ThemeContext } from '../src/theme';
import { PreviewWebView } from '../src/preview/PreviewWebView';
import { mock } from './previewWebViewMock';

const url = 'http://127.0.0.1:12345/';
function Fixture() {
  const [dark, setDark] = useState(true);
  const [, refresh] = useState(0);
  useEffect(() => {
    const emit = (name: string, nativeEvent: object) => mock.props[name]?.({ nativeEvent });
    const begin = () => {
      mock.props.onNavigationStateChange({ url, canGoBack: false, canGoForward: false });
      emit('onLoadStart', { url });
    };
    Object.assign(window, { previewLoading: {
      begin, rerender: () => refresh(value => value + 1), theme: (value: boolean) => setDark(value),
      stats: () => ({ mounts: mock.mounts, unmounts: mock.unmounts, sources: mock.sources.size }),
      ready: () => emit('onMessage', { url, data: JSON.stringify({ preview: 1, kind: 'ready', url }) }),
      script: () => emit('onMessage', { url, data: JSON.stringify({ preview: 1, kind: 'failed', url, detail: 'App failed to boot' }) }),
      http: (status: number, path = '') => emit('onHttpError', { url: url + path, statusCode: status }),
      network: () => emit('onError', { description: 'Connection closed at /_vibyra_preview/SECRET?token=SECRET' }),
    } });
  }, []);
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, bottom: 34, left: 0, right: 0 } }}>
      <PreviewWebView startUrl={url} label="localhost:8001" onClose={() => {}} />
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
