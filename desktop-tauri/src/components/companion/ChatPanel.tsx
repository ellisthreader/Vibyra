import { useEffect, useRef, useState } from "react";

import { SpeakReply, useDraftDictation } from "./ChatVoice";
import { useAccountStore } from "../../state/accountStore";
import { useChatStore, type ChatTurn } from "../../state/chatStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { SendIcon, SparklesIcon } from "../common/Icons";

import { ChatPanelHeader } from "./ChatPanelHeader";
import "./chatDesign.css";

const NO_TURNS: ChatTurn[] = [];
const STARTERS = [
  {
    label: "Explain this project",
    prompt: "Give me a concise overview of this project, its main entry points, and how the pieces fit together.",
  },
  {
    label: "Choose the next useful task",
    prompt: "Review this project and suggest the smallest useful next task, with a clear reason.",
  },
];

export function ChatPanel({ active = true }: { active?: boolean }) {
  const projectId = useProjectStore((s) => s.activeId);
  const threads = useChatStore((s) => s.threads);
  const turns = (projectId ? threads[projectId] : undefined) ?? NO_TURNS;
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const clear = useChatStore((s) => s.clear);
  const serviceConfigured = useSettingsStore((s) => Boolean(s.settings?.openaiKeyConfigured));
  const email = useAccountStore(s => s.snapshot.profile?.email ?? "guest");
  const draftKey = `companion.draft.${encodeURIComponent(email)}.${projectId}`;
  const [draft, updateDraft] = useState(() => { try { return localStorage.getItem(draftKey) ?? ""; } catch { return ""; } });
  const [draftError, setDraftError] = useState("");
  const setDraft = (text: string) => { updateDraft(text); try { localStorage.setItem(draftKey, text); } catch { setDraftError("This draft could not be saved. Keep Chat open until you send it."); } };
  const voice = useDraftDictation(draftKey, active && serviceConfigured, text => setDraft([draft, text].filter(Boolean).join(" ")));
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, sending]);

  if (!projectId) return null;

  const submit = (value = draft) => {
    const text = value.trim();
    if (!text || sending) return;
    setDraft("");
    if (composerRef.current) composerRef.current.style.height = "";
    void send(projectId, text);
  };

  return (
    <div className="companion-panel companion-panel--chat">
      <ChatPanelHeader hasTurns={turns.length > 0} onClear={() => clear(projectId)} />
      <div className="chat-scroll" ref={scrollRef} role="log" aria-label="Conversation">
        {turns.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty__mark"><SparklesIcon size={24}/></div>
            <h3>What are we building?</h3>
            <p>A question, an idea, a place to start.</p>
            <div className="chat-starters">
              {STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  onClick={() => submit(starter.prompt)}
                >
                  <SparklesIcon size={13} />
                  <span>{starter.label}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) => (
          <div key={index} className={`chat-turn chat-turn--${turn.role}`}>
            {turn.role === "assistant" && <span className="chat-turn__token" aria-hidden="true"><SparklesIcon size={14}/></span>}
            <div className="chat-turn__bubble">{turn.content}{turn.role === "assistant" && <div><SpeakReply text={turn.content} active={active} /></div>}</div>
          </div>
        ))}
        {sending && (
          <div className="chat-turn chat-turn--assistant">
            <span className="chat-turn__token" aria-hidden="true"><SparklesIcon size={14}/></span>
            <div className="chat-turn__bubble chat-turn__bubble--thinking">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        {(error || draftError) && <p className="chat-error" role="alert">{error || draftError}</p>}
      </div>
      <div className="chat-input">
        <textarea
          ref={composerRef}
          className="chat-input__area"
          value={draft}
          rows={1}
          placeholder="Message Vibyra…"
          aria-label="Message Vibyra"
          spellCheck={false}
          onFocus={voice.focus}
          onChange={(e) => setDraft(e.target.value)}
          onInput={(event) => {
            const field = event.currentTarget;
            field.style.height = "auto";
            field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="chat-composer-tools"><span title="Enter to send · Shift + Enter for a new line">{serviceConfigured ? "Shift + Enter for a new line" : "Test chat · sample replies"}</span>
        {voice.button}
        <button
          className="chat-input__send"
          aria-label="Send message"
          title="Send"
          onClick={() => submit()}
          disabled={!draft.trim() || sending}
        >
          <SendIcon size={14} />
        </button>
        </div>
      </div>
    </div>
  );
}
