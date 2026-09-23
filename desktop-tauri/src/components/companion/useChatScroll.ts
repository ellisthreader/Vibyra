import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ChatTurn } from '../../state/chatTypes';

/** Keep the reader's place. Hidden tools must never measure a zero-height log. */
export function useChatScroll(turns: ChatTurn[], active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const size = useRef({ width: 0, height: 0 });
  const [atLatest, setAtLatest] = useState(true);
  const jump = useCallback(() => {
    pinned.current = true;
    setAtLatest(true);
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, []);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    if (pinned.current) element.scrollTop = element.scrollHeight;
  }, [turns, active]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const observer = new ResizeObserver(() => {
      size.current = { width: element.clientWidth, height: element.clientHeight };
      // A taller draft or a smaller window must not push the latest reply out
      // of view while leaving the reader marked as pinned to the bottom.
      if (pinned.current) jump();
      else if (element.scrollHeight - element.scrollTop - element.clientHeight <= 48) {
        pinned.current = true;
        setAtLatest(true);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, jump]);
  const onScroll = () => {
    const element = ref.current;
    if (!active || !element) return;
    const resized = size.current.width !== element.clientWidth || size.current.height !== element.clientHeight;
    size.current = { width: element.clientWidth, height: element.clientHeight };
    // WebKit can dispatch a resize-induced scroll before ResizeObserver runs.
    if (pinned.current && resized) { jump(); return; }
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 48;
    setAtLatest(pinned.current);
  };
  return { ref, atLatest, jump, onScroll };
}
