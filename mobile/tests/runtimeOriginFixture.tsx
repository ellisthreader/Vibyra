import { createRoot } from 'react-dom/client';
import { createRef } from 'react';
import { RuntimeBridge } from '../src/transport/RuntimeBridge.web';
import type { BridgeHandle } from '../src/transport/Bridge.types';
const bridge = createRef<BridgeHandle>();
const notices: unknown[] = [];
Object.assign(window, { runtimeNotices: notices, runtimePost: (value: unknown) => bridge.current?.post(value) });
createRoot(document.getElementById('root')!).render(<RuntimeBridge ref={bridge} onMessage={notice => notices.push(notice)} />);
