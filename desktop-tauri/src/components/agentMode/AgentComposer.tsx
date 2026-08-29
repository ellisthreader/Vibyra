import { useEffect, useRef, useState } from "react";

import type { AgentProfile, PermissionMode } from "../../agentTypes";
import { SendIcon } from "../common/Icons";
import { StopIcon } from "../common/AgentIcons";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
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
  const [text, setText] = useState("");
  const [permission, setPermission] = useState<PermissionMode | null>(null);
  const running = useAgentChatStore((state) => Boolean(state.running[chatId]));
  const error = useAgentChatStore((state) => state.error);
  const send = useAgentChatStore((state) => state.send);
  const cancel = useAgentChatStore((state) => state.cancel);
  const places = useAgentRosterStore((state) => (agent ? state.places[agent.id] : undefined));
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
  }, [chatId]);

  const level = permission ?? agent?.permission ?? "plan";

  const submit = () => {
    const prompt = text.trim();
    if (!prompt || running) return;
    setText("");
    void send(chatId, prompt, level);
  };

  return (
    <div className="composer" data-welcome-focus>
      <ComposerDisclosure agent={agent} places={places} permission={level} />
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
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer__actions">
          <ComposerAttachments chatId={chatId} />
          <PermissionPicker value={level} onChange={setPermission} />
          {running ? (
            <button className="composer__stop" onClick={() => void cancel(chatId)}>
              <StopIcon size={13} /> Stop
            </button>
          ) : (
            <button className="composer__send" disabled={!text.trim()} onClick={submit}>
              <SendIcon size={13} /> Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
