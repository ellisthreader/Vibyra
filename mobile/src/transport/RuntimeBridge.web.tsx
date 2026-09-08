import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { runtimeHtml } from '../generated/runtime';
import type { BridgeHandle, BridgeProps } from './Bridge.types';

export const RuntimeBridge = forwardRef<BridgeHandle, BridgeProps>(({ onMessage }, ref) => {
  const frame = useRef<HTMLIFrameElement>(null);
  useImperativeHandle(ref, () => ({ post: message => frame.current?.contentWindow?.postMessage(JSON.stringify(message), '*') }), []);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      try { onMessage(JSON.parse(event.data)); } catch { /* Ignore invalid bridge data. */ }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);
  return <iframe ref={frame} title="Secure connection" srcDoc={runtimeHtml} sandbox="allow-scripts"
    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, border: 0, pointerEvents: 'none' }} aria-hidden />;
});
