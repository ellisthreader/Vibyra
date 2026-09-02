import { useEffect, useMemo, useRef, useState } from "react";

import { suggestedQuestions } from "../../lib/askActions";
import { useAskStore, turnKey, type AskTurn } from "../../state/askStore";
import { readPanes } from "../../state/askWorkspace";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { ChevronIcon, SendIcon } from "../common/Icons";
import { AskMark } from "./AskMark";
import { AskMicButton, AskMuteToggle, AskReplayButton } from "./AskVoiceButtons";
import { AskVoiceStage } from "./AskVoiceStage";
import { AskWorkspaceCard } from "./AskWorkspaceCard";

/**
 * Ask Vibyra — the assistant that can see the app.
 *
 * It answers about the workspace, never about the user's code: `askContext`
 * builds it a briefing of live state, and the system prompt tells it to hand
 * code questions to a terminal agent. Nothing it replies can act on anything;
 * the buttons come from `suggestedActions`, which reads state directly.
 *
 * Only one thing here is drawn as a container: the user's own message. An
 * answer is the panel's content rather than an object sitting on it, and the
 * empty state is two flat blocks. The previous layout gave a border to the
 * summary card, to each of three actions and to each of four questions, which
 * stacked nine framed rectangles down a 340px column before a word was said.
 */

const NO_TURNS: AskTurn[] = [];

function Turn({ turn, id }: { turn: AskTurn; id: string }) {
  return (
    <div className={`ask-turn ask-turn--${turn.role}`}>
      <div className="ask-turn__body">{turn.content}</div>
      {turn.role === "assistant" && (
        <span className="ask-turn__foot">
          <AskReplayButton turnKey={id} content={turn.content} />
          {turn.redactions ? (
            <span className="ask-redacted" title="Removed before the briefing was sent">
              {turn.redactions} secret{turn.redactions === 1 ? "" : "s"} redacted from terminal
              output
            </span>
          ) : null}
        </span>
      )}
    </div>
  );
}

export function AskPanel() {
  const projectId = useProjectStore((s) => s.activeId);
  const threads = useAskStore((s) => s.threads);
  const sending = useAskStore((s) => s.sending);
  const error = useAskStore((s) => s.error);
  const send = useAskStore((s) => s.send);
  const clear = useAskStore((s) => s.clear);
  const configured = useSettingsStore((s) => Boolean(s.settings?.openaiKeyConfigured));
  const openSettings = useWorkspaceStore((s) => s.openSettingsSection);
  // Re-reads whenever a pane changes state, so the summary is never stale.
  const panesVersion = useTerminalStore((s) => s.panes);
  const activity = useTerminalStore((s) => s.activity);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const panes = useMemo(
    () => readPanes(null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store slices are the trigger
    [panesVersion, activity],
  );
  const turns = (projectId ? threads[projectId] : undefined) ?? NO_TURNS;
  const questions = useMemo(() => suggestedQuestions(panes), [panes]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, sending]);

  if (!projectId) return null;

  const submit = (value = draft) => {
    const text = value.trim();
    if (!text || sending || !configured) return;
    setDraft("");
    if (composerRef.current) composerRef.current.style.height = "";
    void send(projectId, text);
  };

  return (
    <div className="companion-panel companion-panel--ask">
      <header className="ask-head">
        <AskMark />
        <strong>Ask</strong>
        <AskMuteToggle />
        {turns.length > 0 && (
          /* A "×" here would be read as "close the dock" — the one control
             this header must not be mistaken for. The word is unambiguous
             and costs no more room than the glyph did. */
          <button className="ask-head__clear" onClick={() => clear(projectId)}>
            Clear
          </button>
        )}
      </header>

      <div className="ask-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <>
            <p className="ask-intro">
              I can see what your terminals are doing, what they cost and what is waiting on you.
              For questions about your code, ask an agent.
            </p>
            <AskWorkspaceCard panes={panes} />
            <div className="ask-suggest">
              <span className="ask-block__label">Try asking</span>
              {questions.map((question) => (
                <button
                  key={question}
                  type="button"
                  className="ask-suggest__row"
                  disabled={!configured}
                  onClick={() => submit(question)}
                >
                  <span>{question}</span>
                  <ChevronIcon size={13} />
                </button>
              ))}
            </div>
          </>
        )}
        {turns.map((turn, index) => (
          <Turn key={index} turn={turn} id={turnKey(projectId, index)} />
        ))}
        {error && <p className="ask-error" role="alert">{error}</p>}
      </div>

      <AskVoiceStage />

      {!configured && (
        <div className="ask-setup" role="note">
          <span>Ask needs your OpenAI API key.</span>
          <button onClick={() => openSettings("ai")}>Add a key</button>
        </div>
      )}

      <div className="ask-input">
        <textarea
          ref={composerRef}
          className="ask-input__area"
          value={draft}
          rows={1}
          placeholder={configured ? "Ask about your workspace…" : "Add an OpenAI key to ask"}
          aria-label="Ask Vibyra"
          disabled={!configured}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onInput={(event) => {
            const field = event.currentTarget;
            field.style.height = "auto";
            field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <AskMicButton disabled={!configured} />
        <button
          className="ask-input__send"
          aria-label="Send"
          title="Send"
          onClick={() => submit()}
          disabled={!configured || !draft.trim() || sending}
        >
          <SendIcon size={14} />
        </button>
      </div>
    </div>
  );
}
