// Names for conversation terminals (every Vibyra Codex terminal is one). They
// launch titled after their model ("GPT-6 Astra"), so the name comes from the
// work instead: the agent's own title when it wrote one, otherwise the first
// request that names work. Pure, so it is tested without a webview.
import type { SharedSession } from "../ipc/sharedChats";
import type { TitleHint } from "../ipc/terminal";
import { cleanNativeTitle, titleFromPrompt } from "./promptTitle.ts";

const TITLED_KINDS = ["codex", "claude"];

/** The agent's own name wins; else the first request that is not small talk. */
export function conversationTitle(hint: Pick<TitleHint, "nativeTitle" | "requests">): string | null {
  const native = cleanNativeTitle(hint.nativeTitle);
  if (native) return native;
  for (const request of hint.requests ?? []) {
    const title = titleFromPrompt(request);
    if (title) return title;
  }
  return null;
}

/** Sessions wearing their work names; the launch title stays as the fallback. */
export function withTitles(sessions: SharedSession[], titles: Record<string, string>): SharedSession[] {
  return sessions.map(session => {
    const title = titles[session.id];
    return title && title !== session.title ? { ...session, title } : session;
  });
}

/** Which conversations to ask about. The quick pass: running ones with no name
 * yet. The slow pass: open ones (their agent may rename them), plus any other
 * unnamed one once per launch, since a saved conversation does not change. */
export function conversationsToName(sessions: SharedSession[], titles: Record<string, string>,
  scope: "unnamed" | "all", open: string[], tried: Set<string>, limit = 24): SharedSession[] {
  return sessions
    .filter(session => TITLED_KINDS.includes(session.kind ?? ""))
    .filter(session => scope === "unnamed" ? !titles[session.id] && session.status === "running"
      : open.includes(session.id) || session.status === "running" || (!titles[session.id] && !tried.has(session.id)))
    .slice(0, limit);
}
