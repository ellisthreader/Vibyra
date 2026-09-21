import { useCallback, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { terminalHtml } from '../generated/terminal';
import { useTheme } from '../theme';
import { useTerminalBridge } from './useTerminalBridge';
import type { TerminalSurfaceHandle, TerminalSurfaceProps } from './TerminalSurface.types';
import { NativeTerminalInput } from './NativeTerminalInput';

export function TerminalSurface({ ref, ...props }: TerminalSurfaceProps & { ref?: Ref<TerminalSurfaceHandle> }) {
  const view = useRef<WebView>(null);
  const { colors } = useTheme();
  const [request, setRequest] = useState(0);
  const post = useCallback((message: string) => view.current?.postMessage(message), []);
  const bridge = useTerminalBridge({ ...props, onTap: () => {
    setRequest(current => current + 1);
    props.onTap?.();
  } }, post);
  const focus = useCallback((focused: boolean) => post(JSON.stringify({
    target: 'vibyra-terminal', type: 'keyboard', focused,
  })), [post]);
  useImperativeHandle(ref, () => ({ scrollToBottom: bridge.scrollToBottom }), [bridge.scrollToBottom]);
  return <View style={{ flex: 1 }}><WebView ref={view} source={{ html: terminalHtml }} originWhitelist={['about:blank']}
    style={{ flex: 1, backgroundColor: colors.workspace }} scrollEnabled={false}
    javaScriptEnabled domStorageEnabled={false}
    // NativeTerminalInput owns the Apple keyboard; WebView only renders output.
    keyboardDisplayRequiresUserAction
    // WKWebView's own bar above the keyboard (previous/next field arrows and
    // Done) is for web forms; over a terminal it was the "up and down" strip
    // the user asked to lose. The keyboard's return key and a second tap on
    // the output are all that is needed.
    hideKeyboardAccessoryView automaticallyAdjustContentInsets={false}
    allowsLinkPreview={false} setSupportMultipleWindows={false}
    onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
    // The renderer announces itself again once it is back, and is then sent
    // everything from the top.
    onContentProcessDidTerminate={() => view.current?.reload()}
    onMessage={event => bridge.receive(event.nativeEvent.data)} />
    <NativeTerminalInput disabled={props.disabled} request={request} onInput={props.onInput} onFocusChange={focus} />
  </View>;
}
