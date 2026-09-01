import { useEffect, useRef, useState } from "react";

import type { AgentProfile } from "../../agentTypes";
import { NONE } from "../../lib/emptyList";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { AgentComposer } from "./AgentComposer";
import { AgentTranscript } from "./AgentTranscript";
import { ChatEmpty } from "./ChatEmpty";
import { HandoffBar } from "./HandoffBar";
import { mailAllowlist } from "../../ipc/agentMail";

/**
 * The transcript and the composer, with the scroll rule that makes a streaming
 * answer readable.
 *
 * Anchored to the bottom only while the reader is already there. Scrolling up
 * mid-answer to re-read something and being yanked back down by the next chunk
 * is the single most irritating thing a streaming UI can do, and the terminal
 * pane solves it the same way.
 *
 * The anchor check runs before anything is read from the element, so a reader
 * who has scrolled up costs no layout at all while text streams past. When it
 * does run it is batched into a frame, so two commits in one frame measure
 * once.
 */
export function ChatSurface({ agent }: { agent: AgentProfile | null }) {
  const chatId = useAgentModeStore((state) => state.chatId);
  const blocks = useAgentChatStore((state) =>
    chatId ? (state.transcripts[chatId]?.blocks ?? NONE) : NONE,
  );
  const [allowed, setAllowed] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const anchored = useRef(true);
  const frame = useRef(0);

  useEffect(() => {
    if (!anchored.current || frame.current) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      const node = scroller.current;
      if (node && anchored.current) node.scrollTop = node.scrollHeight;
    });
    return () => {
      if (!frame.current) return;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [blocks]);

  // A fresh chat starts anchored; otherwise opening an old one would land
  // wherever the previous chat's scroll happened to be.
  useEffect(() => {
    anchored.current = true;
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [chatId]);

  useEffect(() => {
    if (!agent?.id) {
      setAllowed([]);
      return;
    }
    void mailAllowlist(agent.id).then(setAllowed).catch(() => setAllowed([]));
  }, [agent?.id]);

  if (!chatId) return <ChatEmpty agent={agent} />;

  return (
    <div className="chat-surface">
      <div
        className="chat-surface__scroll"
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          anchored.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}
      >
        <AgentTranscript chatId={chatId} blocks={blocks} agent={agent} />
      </div>
      {agent && allowed.length > 0 && <HandoffBar agent={agent} allowed={allowed} />}
      <AgentComposer agent={agent} chatId={chatId} />
    </div>
  );
}
