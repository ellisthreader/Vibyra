import { useEffect, useMemo, useRef, useState } from 'react';
import { startReplySpeech, stopReplySpeech } from '../../lib/speechPlayback';
import { invoke } from '@tauri-apps/api/core';
import { useVoiceStore } from '../../state/voiceStore';
import './chatVoice.css';

export function useDraftDictation(identity: string, active: boolean, append: (text: string) => void) {
  const latest = useRef(append); latest.current = append;
  const target = useMemo(() => ({ mode: 'work' as const, title: 'Chat draft', append: (text: string) => latest.current(text) }), [identity]);
  const phase = useVoiceStore(s => s.phase);
  const owner = useVoiceStore(s => s.draftTarget);
  const recording = ['starting', 'listening', 'transcribing'].includes(phase);
  useEffect(() => () => {
    const state = useVoiceStore.getState();
    if (state.draftTarget === target) {
      if (['starting', 'listening', 'transcribing'].includes(state.phase)) state.cancel();
      useVoiceStore.setState({ draftTarget: null });
    }
  }, [target, active]);
  const focus = () => {
    if (active && (!recording || owner === target)) useVoiceStore.setState({ draftTarget: target });
  };
  return { focus, button: <button type="button" className={`chat-voice-button ${owner === target && recording ? 'is-recording' : ''}`}
    aria-label={owner === target && phase === 'listening' ? 'Finish dictation' : 'Dictate message'}
    title="Dictate into your draft" disabled={!active || (recording && owner !== target) || phase === 'transcribing'}
    onClick={() => { focus(); useVoiceStore.getState().toggle(); }}>
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>
  </button> };
}

export function SpeakReply({ text, active = true }: { text: string; active?: boolean }) {
  const [playing, setPlaying] = useState(false), [error, setError] = useState('');
  const id = useRef(crypto.randomUUID());
  const pending = useRef(false), alive = useRef(true);
  useEffect(() => {
    const owner = id.current; alive.current = active;
    if (!active) setPlaying(false);
    return () => { alive.current = false; void stopReplySpeech(owner).catch(() => {}); };
  }, [active]);
  useEffect(() => {
    if (!playing) return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { if (!await invoke<boolean>('speech_active', { id: id.current })) { if (alive) setPlaying(false); return; } }
      catch (error) { if (alive) { setError(String(error)); setPlaying(false); } return; }
      if (alive) timer = setTimeout(poll, 400);
    };
    timer = setTimeout(poll, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [playing]);
  const toggle = async () => {
    if (pending.current || !active) return;
    pending.current = true; setError('');
    try {
      await (playing ? stopReplySpeech(id.current) : startReplySpeech(id.current, text));
      if (alive.current) setPlaying(!playing);
    } catch (error) { setError(String(error)); setPlaying(false); }
    finally { pending.current = false; }
  };
  return <span className="reply-audio"><button type="button" className="chat-voice-button" aria-label={playing ? 'Stop reading' : 'Read reply aloud'} title={playing ? 'Stop reading' : 'Read reply aloud'} onClick={() => void toggle()}>
    {playing ? <span aria-hidden="true">■</span> : <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></svg>}
  </button>{error && <small role="alert">{error}</small>}</span>;
}
