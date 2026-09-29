import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Constants from 'expo-constants';
import type { BridgeHandle, BridgeProps } from './Bridge.types';

export const RuntimeBridge = forwardRef<BridgeHandle, BridgeProps>(({ onMessage }, ref) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = window.location.origin;
  const base = String(Constants.expoConfig?.extra?.webBasePath ?? '').replace(/\/+$/, '');
  const source = new URL(`${base}/__vibyra/transport.html`, origin).href;
  useImperativeHandle(
    ref,
    () => ({
      post: (message) => frame.current?.contentWindow?.postMessage(JSON.stringify(message), origin),
    }),
    [origin],
  );
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin || typeof event.data !== 'string') return;
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        /* Ignore invalid bridge data. */
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage, origin]);
  return (
    <iframe
      ref={frame}
      title="Secure connection"
      src={source}
      referrerPolicy="no-referrer"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
        border: 0,
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  );
});
RuntimeBridge.displayName = 'RuntimeBridge';
