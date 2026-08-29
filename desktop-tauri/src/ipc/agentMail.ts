import { invoke } from "@tauri-apps/api/core";

import type { MailMessage } from "../agentTypes";

// Handoffs. A message can never widen what the recipient may do — its turn is
// built from its own profile — so what comes back is only whether it landed,
// was refused, or needs the user's decision first.

export interface HandoffResult {
  status: "delivered" | "refused" | "awaitingApproval";
  /** The sentence to show. A refusal's own words, or a note that it landed. */
  message: string;
  chatId: string | null;
}

export function sendHandoff(handoff: {
  senderId: string;
  senderName: string;
  recipientId: string;
  body: string;
  parentId?: string | null;
}): Promise<HandoffResult> {
  return invoke("agent_mail_send", {
    handoff: { ...handoff, parentId: handoff.parentId ?? null },
  });
}

export function mailTrail(agentId: string): Promise<MailMessage[]> {
  return invoke("agent_mail_trail", { agentId });
}

export function mailAllowlist(agentId: string): Promise<string[]> {
  return invoke("agent_mail_allowlist", { agentId });
}

export function setMailAllowlist(agentId: string, peers: string[]): Promise<void> {
  return invoke("agent_mail_set_allowlist", { agentId, peers });
}
