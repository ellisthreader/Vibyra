import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme';
import { outputDelta } from './outputDelta';
import { TERMINAL_TARGET, terminalOutput, terminalScroll, terminalState } from './terminalState';
import type { TerminalSurfaceProps } from './TerminalSurface.types';

/**
 * What both terminal surfaces share: the messages to the isolated renderer and
 * the ones back from it. Only new bytes cross the bridge. The whole tail used
 * to be re-sent on every frame — up to 240 KB, fifty times a second on a busy
 * agent — and serialising it through the WebView bridge was most of what made
 * the phone feel stuck while a command ran.
 */
export function useTerminalBridge(props: TerminalSurfaceProps, post: (message: string) => void) {
  const { output, disabled, fontSize, grid, mirror, onInput, onResize, onPasteMode, onFontSize, onFollow, onTap } = props;
  const mirrored = mirror && grid ? grid : null;
  const { colors, dark } = useTheme();
  // Counts renderer starts. A reloaded WebView announces itself again and
  // needs everything from the top, so its output is keyed to the start it saw.
  const [epoch, setEpoch] = useState(0);
  const sent = useRef<{ epoch: number; output: string } | null>(null);
  const send = useCallback((message: object) => post(JSON.stringify(message)), [post]);
  useEffect(() => {
    if (epoch === 0) return;
    send(terminalState(disabled, colors, dark, fontSize, mirrored));
    // The grid is two integers; a fresh object with the same two must not resend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, disabled, colors, dark, fontSize, mirrored?.cols, mirrored?.rows, send]);
  useEffect(() => {
    if (epoch === 0) return;
    const previous = sent.current?.epoch === epoch ? sent.current.output : null;
    sent.current = { epoch, output };
    if (previous === null) { send(terminalOutput(output, true, grid)); return; }
    const change = outputDelta(previous, output);
    if (!change.reset && !change.data) return;
    send(terminalOutput(change.data, change.reset, grid));
    // `grid` only matters on a reset, and a reset only follows the output changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, output, send]);
  const receive = useCallback((raw: string) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    if (data?.target !== TERMINAL_TARGET) return;
    if (data.type === 'ready') setEpoch(current => current + 1);
    if (data.type === 'paste-mode') onPasteMode?.(data.enabled === true);
    if (data.type === 'follow') onFollow?.(data.atBottom !== false);
    if (data.type === 'tap') onTap?.();
    if (data.type === 'font-size' && typeof data.size === 'number') onFontSize?.(data.size);
    if (data.type === 'input' && !disabled && typeof data.data === 'string') onInput(data.data);
    if (data.type === 'resize' && Number.isInteger(data.cols) && Number.isInteger(data.rows)) onResize(data.cols, data.rows);
  }, [disabled, onInput, onResize, onPasteMode, onFontSize, onFollow, onTap]);
  const scrollToBottom = useCallback(() => send(terminalScroll()), [send]);
  return { receive, scrollToBottom, ready: epoch > 0 };
}
