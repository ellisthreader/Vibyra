import { useCallback, useEffect, useRef } from 'react';
import { terminalHtml } from '../generated/terminal';
import { useTheme } from '../theme';
import { terminalState } from './terminalState';
import type { TerminalSurfaceProps } from './TerminalSurface.types';

export function TerminalSurface({ output, disabled, onInput, onResize, onPasteMode }: TerminalSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const { colors } = useTheme();
  const send = useCallback(() => frame.current?.contentWindow?.postMessage(
    JSON.stringify(terminalState(output, disabled, colors)), '*'), [output, disabled, colors]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.target !== 'vibyra-terminal') return;
      if (data.type === 'ready') { ready.current = true; send(); }
      if (data.type === 'paste-mode') onPasteMode?.(data.enabled === true);
      if (data.type === 'input' && !disabled && typeof data.data === 'string') onInput(data.data);
      if (data.type === 'resize' && !disabled && Number.isInteger(data.cols) && Number.isInteger(data.rows)) onResize(data.cols, data.rows);
    };
    window.addEventListener('message', receive);
    if (ready.current) send();
    return () => window.removeEventListener('message', receive);
  }, [send, disabled, onInput, onResize, onPasteMode]);
  return <iframe ref={frame} title={disabled ? 'Terminal output, observing' : 'Interactive terminal'}
    srcDoc={terminalHtml} sandbox="allow-scripts" style={{ width: '100%', height: '100%', flex: 1,
      border: 0, background: colors.workspace }} />;
}
