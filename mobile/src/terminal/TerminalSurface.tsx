import { useCallback, useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { terminalHtml } from '../generated/terminal';
import { useTheme } from '../theme';
import { terminalState } from './terminalState';
import type { TerminalSurfaceProps } from './TerminalSurface.types';

export function TerminalSurface({ output, disabled, onInput, onResize, onPasteMode }: TerminalSurfaceProps) {
  const view = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const { colors } = useTheme();
  const send = useCallback(() => view.current?.postMessage(
    JSON.stringify(terminalState(output, disabled, colors))), [output, disabled, colors]);
  useEffect(() => { if (ready) send(); }, [ready, send]);
  return <WebView ref={view} source={{ html: terminalHtml }} originWhitelist={['about:blank']}
    style={{ flex: 1, backgroundColor: colors.workspace }} scrollEnabled={false}
    javaScriptEnabled domStorageEnabled={false} keyboardDisplayRequiresUserAction
    hideKeyboardAccessoryView={false} automaticallyAdjustContentInsets={false}
    allowsLinkPreview={false} setSupportMultipleWindows={false}
    onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
    onContentProcessDidTerminate={() => { setReady(false); view.current?.reload(); }}
    onMessage={event => {
      let data;
      try { data = JSON.parse(event.nativeEvent.data); } catch { return; }
      if (data.target !== 'vibyra-terminal') return;
      if (data.type === 'ready') { setReady(true); send(); }
      if (data.type === 'paste-mode') onPasteMode?.(data.enabled === true);
      if (data.type === 'input' && !disabled && typeof data.data === 'string') onInput(data.data);
      if (data.type === 'resize' && !disabled && Number.isInteger(data.cols) && Number.isInteger(data.rows)) onResize(data.cols, data.rows);
    }} />;
}
