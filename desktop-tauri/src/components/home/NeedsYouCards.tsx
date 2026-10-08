import type { ReactNode } from "react";

import type { PhoneDevice } from "../../ipc/phone";
import { lastOutputAt } from "../../lib/activity";
import { agentIdentity } from "../../lib/agentIdentity";
import { clearTerminal, openPane, waitingLine } from "../../lib/needsYou";
import { runNotificationAction } from "../../lib/notificationActions";
import { relativeTime } from "../../lib/relativeTime";
import type { InboxItem } from "../../lib/teammateRunNotifications";
import { useAgentAttention, type ChatNeed } from "../../state/agentAttentionStore";
import { useAgentStore } from "../../state/agentStore";
import { useConversationTerminals } from "../../state/conversationTerminalStore";
import { useProjectStore } from "../../state/projectStore";
import { usePhoneStore } from "../../state/phoneStore";
import { paneLabel } from "../../state/terminalStore";
import type { PaneState } from "../../state/terminalStoreTypes";
import { AgentLogo } from "../common/AgentLogo";
import { BotIcon, CloseIcon, PhoneIcon } from "../common/Icons";
import { useTeammateNeeds } from "../../state/teammateNeedsStore";
import { avatarUrl } from "../teammates/api";

/** One thing waiting: who, what they need, one line of context, and the one
 * or two buttons that settle it. */
function Need({ label, icon, title, when, sub, line, plain = false, onClear, children }: {
  label: string; icon: ReactNode; title: string; when?: string; sub: string; line?: string | null; plain?: boolean; onClear?: () => void; children: ReactNode;
}) {
  return <article className="sb-need" aria-label={label}>
    {icon}
    <div className="sb-need__body">
      <div className="sb-need__title"><strong>{title}</strong>{when && <time>{when}</time>}</div>
      <span className="sb-need__sub">{sub}</span>
      {line && (plain ? <span className="sb-need__line sb-need__line--plain">{line}</span> : <code className="sb-need__line">{line}</code>)}
    </div>
    <div className="sb-need__acts">{children}
      {onClear && <button type="button" className="sb-need__clear" title="Clear" aria-label={`Clear: ${title}`} onClick={onClear}><CloseIcon size={14} /></button>}
    </div>
  </article>;
}

export function TerminalNeed({ pane }: { pane: PaneState }) {
  const catalogue = useAgentStore((s) => s.agents);
  const agent = agentIdentity(pane.agentId, catalogue);
  const since = lastOutputAt(pane.id);
  const title = `${paneLabel(pane)} is waiting for you`;
  return <Need label={title} title={title} when={since ? relativeTime(since) : undefined}
    icon={<AgentLogo agentId={pane.agentId} name={agent.name} size={40} />}
    sub={`${agent.name} · terminal`} line={waitingLine(pane.id)} onClear={() => clearTerminal(pane)}>
    <button type="button" className="btn btn--primary" onClick={() => void openPane(pane)}>Open terminal</button>
  </Need>;
}

/** An agent chat that wants approval, or finished while you were away. */
export function ChatNeedCard({ need }: { need: ChatNeed }) {
  const catalogue = useAgentStore((s) => s.agents);
  const agent = agentIdentity(need.agentId, catalogue);
  const approval = need.kind === "approval";
  const title = approval ? `${need.title} needs your approval` : `${need.title} finished`;
  const open = async () => {
    await useProjectStore.getState().activate(need.projectId);
    useConversationTerminals.getState().reveal(need.sessionId);
    useAgentAttention.getState().markSeen(need.sessionId);
  };
  return <Need label={title} title={title} when={need.at ? relativeTime(need.at) : undefined}
    icon={<AgentLogo agentId={need.agentId} name={agent.name} size={40} />}
    sub={approval ? `${agent.name} · waiting for you` : `${agent.name} · done`} line={need.detail} plain onClear={() => useAgentAttention.getState().dismiss(need)}>
    <button type="button" className="btn btn--primary" onClick={() => void open()}>{approval ? "Review" : "Open chat"}</button>
  </Need>;
}

export function TeammateNeed({ item, teammate }: { item: InboxItem; teammate?: { name: string; avatar: string } }) {
  const signin = item.destination.kind === "signin";
  const created = Date.parse(item.createdAt);
  return <Need label={item.title} title={item.title} when={Number.isFinite(created) ? relativeTime(created) : undefined}
    icon={teammate ? <img className="sb-need__icon" src={avatarUrl(teammate.avatar)} alt="" />
      : <span className="sb-need__icon sb-need__icon--teammate" aria-hidden="true"><BotIcon size={17} /></span>}
    sub={`${teammate?.name ?? "Teammate"} · ${signin ? "Needs you to sign in" : "Needs your approval"}`}
    onClear={() => useTeammateNeeds.getState().hide(item.id)}>
    <button type="button" className="btn btn--primary"
      onClick={() => runNotificationAction({ id: "openTeammate", label: "Open chat", arg: item.destination.agentId ?? undefined })}>Open chat</button>
  </Need>;
}

export function PhoneNeed({ device }: { device: PhoneDevice }) {
  const typing = usePhoneStore((s) => s.status?.typing === true);
  const preview = usePhoneStore((s) => s.status?.previewAutoAvailable === true);
  const busy = usePhoneStore((s) => s.busy);
  const answer = (approve: boolean) => void usePhoneStore.getState().answer(device.id, approve, approve && preview ? true : undefined);
  const route = device.lastRoute === "cloud" ? "Through Vibyra Cloud · " : device.lastRoute === "nearby" ? "Nearby · " : "";
  const title = `${device.name} wants to connect`;
  return <Need label={title} title={title}
    icon={<span className="sb-need__icon sb-need__icon--phone" aria-hidden="true"><PhoneIcon size={17} /></span>}
    sub={`${route}${typing ? "Can read your terminals and send instructions" : "Can read your terminals, typing stays off"}`}>
    <button type="button" className="btn" disabled={busy} onClick={() => answer(false)}>Deny</button>
    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => answer(true)}>Allow</button>
  </Need>;
}
