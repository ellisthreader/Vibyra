import { useEffect, useRef, useState } from "react";

import logoUrl from "../../assets/vibyra-cobalt.png";
import { useChatStore, type ChatTurn } from "../../state/chatStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { MoreIcon, SendIcon, SparklesIcon } from "../common/Icons";

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

export function ChatPanel() {
  const projectId = useProjectStore((s) => s.activeId);
  const threads = useChatStore((s) => s.threads);
  const turns = (projectId ? threads[projectId] : undefined) ?? NO_TURNS;
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const send = useChatStore((s) => s.send);
  const clear = useChatStore((s) => s.clear);
  const serviceConfigured = useSettingsStore((s) => Boolean(s.settings?.openaiKeyConfigured));
  const openKeySettings = useWorkspaceStore((s) => s.openSettingsSection);
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, sending]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

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
      <div className="chat-identity">
        <img src={logoUrl} alt="" />
        <div>
          <strong>Vibyra AI</strong>
          <span>Project companion</span>
        </div>
        {turns.length > 0 && (
          <div className="chat-menu" ref={menuRef}>
            <button
              className="icon-btn"
              aria-label="Conversation options"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="Conversation options"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreIcon size={14} />
            </button>
            {menuOpen && (
              <div className="chat-menu__popover" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    clear(projectId);
                    setMenuOpen(false);
                  }}
                >
                  Clear conversation
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <div className="chat-empty">
            <h3>How can I help?</h3>
            <p>Understand the codebase, trace a problem, or plan the next move.</p>
            <div className="chat-starters">
              {STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  title={serviceConfigured ? undefined : "Add your OpenAI key to use Vibyra AI"}
                  onClick={() => (serviceConfigured ? submit(starter.prompt) : openKeySettings("ai"))}
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
            {turn.role === "assistant" && <span className="chat-turn__token">❯</span>}
            <div className="chat-turn__bubble">{turn.content}</div>
          </div>
        ))}
        {sending && (
          <div className="chat-turn chat-turn--assistant">
            <span className="chat-turn__token">❯</span>
            <div className="chat-turn__bubble chat-turn__bubble--thinking">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        {error && <p className="chat-error" role="alert">{error}</p>}
      </div>
      {!serviceConfigured && (
        <div className="chat-setup" role="note">
          <span>Vibyra AI needs your OpenAI API key.</span>
          <button onClick={() => openKeySettings("ai")}>Add a key</button>
        </div>
      )}
      <div className="chat-input">
        <textarea
          ref={composerRef}
          className="chat-input__area"
          value={draft}
          rows={1}
          placeholder={serviceConfigured ? "Message Vibyra…" : "Add an OpenAI key to chat"}
          aria-label="Message Vibyra"
          disabled={!serviceConfigured}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onInput={(event) => {
            const field = event.currentTarget;
            field.style.height = "auto";
            field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="chat-input__send"
          aria-label="Send message"
          title="Send"
          onClick={() => submit()}
          disabled={!serviceConfigured || !draft.trim() || sending}
        >
          <SendIcon size={14} />
        </button>
      </div>
    </div>
  );
}
