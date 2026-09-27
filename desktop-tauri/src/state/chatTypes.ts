/** One line of a project's conversation. A turn is created before its text
 * exists — the assistant's bubble is on screen, streaming, while the reply is
 * still being written — so every turn carries its own status rather than the
 * thread carrying one. */
export interface ChatTurn {
  id: string;
  /** `tool` is an action Vibyra took on the person's behalf — shown as one
   * line in the thread, and sent back to the model as context for its reply. */
  role: "user" | "assistant" | "tool";
  content: string;
  /** `streaming` only ever belongs to the reply currently being written. */
  status: "streaming" | "complete" | "failed";
  createdAt: number;
  /** Why it failed, in the sentence the person should read. */
  error?: string;
  /** The user turn this reply answers — what Retry re-runs from, without
   * asking the question a second time. */
  replyTo?: string;
  /** Stop ended it: a short reply, not a broken one. */
  stopped?: boolean;
  /** The question was asked out loud, so a retry comes back in voice style. */
  spoken?: boolean;
  /** For a tool turn. `summary` is the line the person reads; `content`
   * holds the detail, which only the model needs. */
  tool?: { name: string; summary: string; failed?: boolean };
}
