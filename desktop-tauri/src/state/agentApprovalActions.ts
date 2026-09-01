import type { ApprovalRequest } from "../agentTypes";
import * as ipc from "../ipc/agentConfig";

// The decisions queue, split from the rest of the work store.
//
// It is the one slice with a rule in it — a card is answered against today's
// grants, and approving one whose action has moved authorises nothing — and it
// is the slice the work bus, the rail badge and the mode-switch pip all read.
// The others (memory, skills, routines) are plain lists.

interface ApprovalSlice {
  approvals: ApprovalRequest[];
  approvalChatIds: string[];
  error: string | null;
}

type Set = (partial: Partial<ApprovalSlice>) => void;
type Get = () => { loadApprovals: () => Promise<void> };

export function approvalActions(set: Set, get: Get) {
  return {
    loadApprovals: async () => {
      const approvals = await ipc.listApprovals().catch(() => []);
      set({
        approvals,
        approvalChatIds: approvals
          .map((request) => request.chatId)
          .filter((id): id is string => Boolean(id)),
      });
    },

    resolveApproval: async (
      id: string,
      approved: boolean,
      fingerprint: string,
    ) => {
      try {
        const resolved = await ipc.resolveApproval(id, approved, fingerprint);
        if (resolved.state === "invalidated") {
          set({
            error:
              "That action changed after the card was raised, so nothing was done. " +
              "Ask again if you still want it.",
          });
        }
      } catch (error) {
        set({ error: String(error) });
      }
      await get().loadApprovals();
    },
  };
}
