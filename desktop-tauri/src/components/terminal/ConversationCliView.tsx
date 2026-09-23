import { useEffect, useRef, useState } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { attachTerminalClipboard } from '../../lib/terminalClipboard';
import { attachRenderer } from '../../lib/xtermRenderer';
import { terminalFont } from '../../lib/terminalFont';
import { dropCarriesText, terminalDropText } from '../../lib/terminalDrop';
import { themeFor } from '../../lib/xtermTheme';
import { useSettingsStore } from '../../state/settingsStore';
import type { TermEvent } from '../../types';

export function ConversationCliView({ sessionId, visible, fontSize, onFocus }: {
  sessionId: string; visible: boolean; fontSize: number; onFocus: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<{ term: Terminal; fit: FitAddon } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [started, setStarted] = useState(false);
  const settings = useSettingsStore(s => s.settings);
  const current = useRef({ settings, fontSize }); current.current = { settings, fontSize };
  const visibility = useRef(visible); visibility.current = visible;
  useEffect(() => { if (visible) setStarted(true); }, [visible]);
  useEffect(() => {
    const element = host.current;
    const settings = current.current.settings;
    if (!started || !element || !settings) return;
    let disposed = false;
    let attached = false;
    let frame = 0;
    const term = new Terminal({ fontSize: current.current.fontSize, fontFamily: terminalFont(settings.fontFamily),
      theme: themeFor(settings.theme), scrollback: settings.scrollbackLines, allowProposedApi: true, cursorBlink: false });
    const fit = new FitAddon(); term.loadAddon(fit); term.loadAddon(new WebLinksAddon());
    term.open(element); attachRenderer(term); attachTerminalClipboard(term);
    instance.current = { term, fit };
    const fitNow = () => { if (element.clientWidth > 80 && element.clientHeight > 60) fit.fit(); };
    fitNow();
    const fail = (error: unknown) => { if (!disposed) setError(String(error)); };
    term.onData(data => { void invoke('shared_cli_write', { sessionId, data }).catch(fail); });
    term.onResize(({ rows, cols }) => { if (attached) void invoke('shared_cli_resize', { sessionId, rows, cols }).catch(fail); });
    const channel = new Channel<TermEvent>();
    channel.onmessage = event => {
      if (disposed) return;
      if (event.type === 'output') term.write(event.data);
      else if (event.type === 'resync') { term.reset(); term.write(event.data); }
      else { term.options.disableStdin = true; setError('The terminal disconnected. Reconnect to this conversation, or switch to Chat.'); }
    };
    setError('');
    void invoke('shared_cli_attach', { sessionId, rows: term.rows, cols: term.cols, onEvent: channel }).then(() => {
      attached = true;
      if (disposed) { void invoke('shared_cli_visibility', { sessionId, visible: false }).catch(() => {}); return; }
      void invoke('shared_cli_visibility', { sessionId, visible: visibility.current }).catch(fail);
      fitNow();
    }).catch(fail);
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fitNow); });
    observer.observe(element);
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
    const themeChanged = () => { if (current.current.settings?.theme === 'auto') term.options.theme = themeFor('auto'); };
    systemTheme.addEventListener('change', themeChanged);
    return () => {
      systemTheme.removeEventListener('change', themeChanged);
      disposed = true; observer.disconnect(); cancelAnimationFrame(frame); instance.current = null; term.dispose();
      void invoke('shared_cli_visibility', { sessionId, visible: false }).catch(() => {});
    };
  }, [sessionId, started, attempt]);
  useEffect(() => {
    void invoke('shared_cli_visibility', { sessionId, visible }).catch(() => {});
    const entry = instance.current;
    if (!entry || !settings) return;
    entry.term.options.fontFamily = terminalFont(settings.fontFamily);
    entry.term.options.fontSize = fontSize;
    entry.term.options.theme = themeFor(settings.theme);
    entry.term.options.scrollback = settings.scrollbackLines;
    if (visible && host.current && host.current.clientWidth > 80 && host.current.clientHeight > 60) entry.fit.fit();
  }, [visible, fontSize, settings, sessionId]);
  return <div className="conversation-cli-body">
    {error && <div className="conversation-cli-error" role="alert"><span>{error}</span>
      <button className="btn" onClick={() => setAttempt(n => n + 1)}>Reconnect terminal</button>
      <button className="btn" onClick={() => void useSettingsStore.getState().update({ agentView: 'chat' }).catch(fail => setError(String(fail)))}>Open Chat</button></div>}
    <div ref={host} className="conversation-cli-host" aria-label="Codex CLI terminal" onMouseDown={onFocus}
      onDragOver={event => { if (dropCarriesText(event.dataTransfer.types)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={event => { const text = terminalDropText(event.dataTransfer); if (text) {
        event.preventDefault(); instance.current?.term.paste(text); instance.current?.term.focus(); onFocus();
      } }} />
  </div>;
}
