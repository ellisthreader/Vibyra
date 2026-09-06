import { EMPTY_DRAFT, useAgentDraftStore } from "../../state/agentDraftStore";
import { useAgentRunStore } from "../../state/agentRunStore";
import { useSettingsStore } from "../../state/settingsStore";
import { activeAccountId } from "../../lib/providerAccountPolicy";
import { ComposerAccount } from "./ComposerAccount";
import { useEffect, useRef } from "react";

import type { AgentProfile } from "../../agentTypes";
import { SendIcon } from "../common/Icons";
import { StopIcon } from "../common/AgentIcons";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore, capabilityFor } from "../../state/agentRosterStore";
import { ComposerAttachments } from "./ComposerAttachments";
import { ComposerDisclosure } from "./ComposerDisclosure";
import { PermissionPicker } from "./PermissionPicker";

/**
 * Where a turn starts.
 *
 * Two rules here are worth stating. The permission control defaults to the
 * agent's own level and only ever narrows it for this turn — it is not a way
 * to exceed what the agent may do, and the native side reads the same value
 * the assembler does. And Send becomes Stop while a turn runs, in the same
 * place, because a second button that only sometimes matters is a button
 * people hunt for at the moment they most need it.
 */
export function AgentComposer({
  agent,
  chatId,
}: {
  agent: AgentProfile | null;
  chatId: string;
}) {
  const saved = useAgentDraftStore((state) => state.drafts[chatId] ?? EMPTY_DRAFT);
  const change = useAgentDraftStore((state) => state.change);
  const { text, permission } = saved;
  const setText = (text: string) => change(chatId, { text });
  const chat = useAgentChatStore((state) => Object.values(state.chats).flat().find((entry) => entry.id === chatId));
  const previous = useAgentRunStore((state) => state.runs.find((run) => run.chatId === chatId));
  const activeAccounts = useSettingsStore((state) => state.settings?.activeProviderAccounts);
  const engine = agent?.engine ?? chat?.engine ?? "claude";
  const accountId = saved.accountId ?? previous?.spec.accountId ?? activeAccountId(activeAccounts, engine);
  const capabilities = useAgentRosterStore((state) => state.capabilities);
  const ready = capabilityFor(capabilities, engine);
  const running = useAgentChatStore((state) => Boolean(state.running[chatId]));
  const error = useAgentChatStore((state) => state.error);
  const send = useAgentChatStore((state) => state.send);
  const cancel = useAgentChatStore((state) => state.cancel);
  const places = useAgentRosterStore((state) => (agent ? state.places[agent.id] : undefined));
  const draft = useAgentModeStore((state) => state.draft);
  const setDraft = useAgentModeStore((state) => state.setDraft);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, [chatId]);

  // Edit & resend hands a past prompt back through the store. Cleared as it is
  // taken, so returning to this chat later does not re-fill the composer with
  // something the user already dealt with, and ignored when it names another
  // chat — a click and a chat switch can land in either order.
  useEffect(() => {
    if (!draft || draft.chatId !== chatId) return;
    setText(draft.text);
    setDraft(null);
    const node = field.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(draft.text.length, draft.text.length);
  }, [draft, chatId, setDraft]);

  const ceiling = agent?.permission ?? (chat?.mountedPlace ? "standard" : "plan");
  const levels = ["plan", "standard", "full"] as const;
  const level = levels[Math.min(levels.indexOf(permission ?? ceiling), levels.indexOf(ceiling))];

  const submit = () => {
    const prompt = text.trim();
    if (!prompt || running || !ready.structured) return;
    void send(chatId, prompt, level, accountId);
  };

  return (
    <div className="composer" data-welcome-focus>
      <ComposerDisclosure agent={agent} places={places} permission={level} mountedPlace={chat?.mountedPlace} />
      {!ready.structured && <p className="composer__error" role="status">{ready.blocker}</p>}
      {error && <p className="composer__error">{error}</p>}
      <div className="composer__field">
        <textarea
          ref={field}
          value={text}
          rows={3}
          placeholder={
            agent ? `Ask ${agent.name} for something` : "Ask anything — this chat has no project"
          }
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line. The prompt is prose
            // often enough that the reverse would be wrong, and a multiline
            // brief is what Shift+Enter is for.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer__actions">
          <ComposerAttachments chatId={chatId} disabled={running} />
          <PermissionPicker value={level} ceiling={ceiling} onChange={(permission) => change(chatId, { permission })} />
          <ComposerAccount engine={engine} value={accountId} disabled={running || Boolean(chat?.sessionId)} onChange={(accountId) => change(chatId, { accountId })} />
          {running ? (
            <button className="composer__stop" onClick={() => void cancel(chatId)}>
              <StopIcon size={13} /> Stop
            </button>
          ) : (
            <button className="composer__send" disabled={!text.trim() || !ready.structured} onClick={submit}>
              <SendIcon size={13} /> Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
