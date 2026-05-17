import type { ChatMessage } from "../types/domain";
import { appApiRequest } from "./appApi";

export type ChatFeedbackOutcome = "worked" | "did_not_work";

export type ChatFeedbackPayload = {
  chatReference: string;
  outcome: ChatFeedbackOutcome;
  messageId?: string;
  editApproval?: ChatMessage["editApproval"];
  pendingApplyId?: string;
};

export type ChatFeedbackResponse = {
  ok: boolean;
  updatedCount: number;
  feedback: ChatFeedbackOutcome | "helpful" | "not_helpful";
};

export function submitChatFeedback(payload: ChatFeedbackPayload, token: string) {
  return appApiRequest<ChatFeedbackResponse>("/api/chat/learning/feedback", {
    method: "POST",
    body: JSON.stringify({
      reference: payload.chatReference,
      feedback: payload.outcome,
      messageId: payload.messageId,
      editApproval: payload.editApproval,
      pendingApplyId: payload.pendingApplyId
    })
  }, token);
}
