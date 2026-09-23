import { useCallback, useEffect, useRef, useState } from "react";

import { requestRun } from "../../lib/runCommand";
import { useAccountStore } from "../../state/accountStore";
import { useChatStore } from "../../state/chatStore";
import type { ChatTurn } from "../../state/chatTypes";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useTalkStore } from "../../state/talkStore";

import { ChatComposer } from "./ChatComposer";
import { ChatPanelHeader } from "./ChatPanelHeader";
import { ChatTurns } from "./ChatTurns";
import { VoiceMode, VoiceModeStrip } from "./VoiceMode";
import { useChatScroll } from './useChatScroll';
import { ChevronDownIcon } from '../common/Icons';
import "./chatDesign.css";

const NO_TURNS: ChatTurn[] = [];

export function ChatPanel({ active = true }: { active?: boolean }) {
  const projectId = useProjectStore((s) => s.activeId);
  // One project's thread, never the whole record: a delta lands about sixty
  // times a second, and every other project would repaint with it.
  const turns = useChatStore((s) => (projectId ? s.threads[projectId] : undefined) ?? NO_TURNS);
  const inFlight = useChatStore((s) => s.active);
  const send = useChatStore((s) => s.send);
  const retry = useChatStore((s) => s.retry);
  const stop = useChatStore((s) => s.stop);
  const clear = useChatStore((s) => s.clear);
  const projects = useSettingsStore((s) => s.settings?.projects);
  const serviceConfigured = useSettingsStore((s) => Boolean(s.settings?.openaiKeyConfigured));
  const email = useAccountStore((s) => s.snapshot.profile?.email ?? "guest");
  const draftKey = `companion.draft.${encodeURIComponent(email)}.${projectId}`;
  const [draft, updateDraft] = useState(() => { try { return localStorage.getItem(draftKey) ?? ""; } catch { return ""; } });
  const [draftError, setDraftError] = useState("");
  const setDraft = useCallback((text: string) => { updateDraft(text); try { localStorage.setItem(draftKey, text); } catch { setDraftError("This draft could not be saved. Keep Chat open until you send it."); } }, [draftKey]);
  const speakingTurn = useTalkStore((s) => s.speakingTurn);
  const talkPhase = useTalkStore((s) => s.phase);
  const showTranscript = useTalkStore((s) => s.showTranscript);
  const talking = talkPhase !== "idle";
  const scroll = useChatScroll(turns, active && (!talking || showTranscript));

  const submit = useCallback((value: string) => {
    const text = value.trim();
    if (!text || !projectId || useChatStore.getState().active) return;
    setDraft("");
    // Your own question always brings you back to the end of the thread.
    scroll.jump();
    void send(projectId, text);
  }, [projectId, send, setDraft, scroll.jump]);
  const onRetry = useCallback((turnId: string) => { if (projectId) void retry(projectId, turnId); }, [projectId, retry]);
  // Stable, or `MarkdownBlocks`' memo is defeated on every delta.
  const onRun = useCallback((_command: string, lines: string[]) => requestRun(lines, projectId ?? ""), [projectId]);

  // `role="log"` below is a polite live region, and rich markdown arriving
  // token by token through one is unusable. The in-flight turn carries
  // `aria-busy`, and the finished reply is announced once, here.
  const streaming = turns.some((turn) => turn.status === "streaming");
  const wasStreaming = useRef(false);
  const [finished, setFinished] = useState("");
  useEffect(() => {
    if (streaming) { wasStreaming.current = true; setFinished(""); }
    else if (wasStreaming.current) { wasStreaming.current = false; setFinished("Reply complete"); }
  }, [streaming]);

  if (!projectId) return null;

  // Voice mode takes the whole panel: a conversation you are having out loud is
  // not a variation on a page of bubbles, and pretending otherwise is how
  // people lose track of which mode they are in.
  if (talking && !showTranscript) return <div className="companion-panel companion-panel--voice"><VoiceMode /></div>;

  // A failure that wrote nothing already says so in its own row; the panel's
  // copy of the same sentence would only announce it twice.
  const lastReply = turns.filter(turn => turn.role === 'assistant').at(-1);
  const silent = lastReply?.status === 'failed' && !lastReply.content;
  const threadError = lastReply?.error;
  const elsewhere = inFlight && inFlight.projectId !== projectId
    ? projects?.find((project) => project.id === inFlight.projectId)?.name ?? "another project"
    : null;

  return (
    <div className="companion-panel companion-panel--chat">
      <ChatPanelHeader projectName={projects?.find(project => project.id === projectId)?.name ?? 'Project'}
        working={inFlight?.projectId === projectId} hasTurns={turns.length > 0} onClear={() => clear(projectId)} />
      <div className="chat-transcript">
      <div
        className="chat-scroll"
        ref={scroll.ref}
        role="log"
        aria-label="Conversation"
        onScroll={scroll.onScroll}
      >
        <ChatTurns
          turns={turns}
          active={active}
          speakingTurn={speakingTurn}
          notice={draftError || (silent ? "" : threadError ?? "")}
          onStart={submit}
          onRetry={onRetry}
          onRun={onRun}
        />
      </div>
      {!scroll.atLatest && <button className="chat-jump" onClick={scroll.jump}><ChevronDownIcon size={14} />Jump to latest</button>}
      </div>
      <p className="sr-only" role="status">{finished}</p>
      {talking ? <VoiceModeStrip /> : null}
      <ChatComposer
        active={active}
        draft={draft}
        setDraft={setDraft}
        serviceConfigured={serviceConfigured}
        sending={Boolean(inFlight) && !elsewhere}
        elsewhere={elsewhere}
        onSubmit={() => submit(draft)}
        onStop={stop}
      />
    </div>
  );
}
