import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { terminalHtml } from '../generated/terminal';
import { useTheme } from '../theme';
import { useTerminalBridge } from './useTerminalBridge';
import type { TerminalSurfaceHandle, TerminalSurfaceProps } from './TerminalSurface.types';

export function TerminalSurface({
  ref,
  ...props
}: TerminalSurfaceProps & { ref?: Ref<TerminalSurfaceHandle> }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { colors } = useTheme();
  const post = useCallback(
    (message: string) => frame.current?.contentWindow?.postMessage(message, '*'),
    [],
  );
  const bridge = useTerminalBridge(props, post);
  const { receive } = bridge;
  useImperativeHandle(ref, () => ({ scrollToBottom: bridge.scrollToBottom }), [
    bridge.scrollToBottom,
  ]);
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      receive(event.data);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [receive]);
  return (
    <iframe
      ref={frame}
      title={props.disabled ? 'Terminal output, observing' : 'Interactive terminal'}
      srcDoc={terminalHtml}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', flex: 1, border: 0, background: colors.workspace }}
    />
  );
}
