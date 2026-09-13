import { useCallback, useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { terminalHtml } from '../generated/terminal';
import { useTheme } from '../theme';
import { terminalState } from './terminalState';
import type { TerminalSurfaceProps } from './TerminalSurface.types';

export function TerminalSurface({ output, disabled, onInput, onResize, onPasteMode, fontSize, onFontSize }: TerminalSurfaceProps) {
  const view = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const { colors, dark } = useTheme();
  const send = useCallback(() => view.current?.postMessage(
    JSON.stringify(terminalState(output, disabled, colors, dark, fontSize))), [output, disabled, colors, dark, fontSize]);
  useEffect(() => { if (ready) send(); }, [ready, send]);
  return <WebView ref={view} source={{ html: terminalHtml }} originWhitelist={['about:blank']}
    style={{ flex: 1, backgroundColor: colors.workspace }} scrollEnabled={false}
    javaScriptEnabled domStorageEnabled={false}
    // xterm's input element is positioned at `left:-9999em`, so a tap never
    // lands on it and the focus it calls afterwards is programmatic. Left at
    // its `true` default, WKWebView refuses that and no keyboard ever appears.
    keyboardDisplayRequiresUserAction={false}
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
      if (data.type === 'font-size' && typeof data.size === 'number') onFontSize?.(data.size);
      if (data.type === 'input' && !disabled && typeof data.data === 'string') onInput(data.data);
      if (data.type === 'resize' && Number.isInteger(data.cols) && Number.isInteger(data.rows)) onResize(data.cols, data.rows);
    }} />;
}
