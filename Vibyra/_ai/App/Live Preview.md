# App - Live Preview

Read this for in-app website/app previews, preview cards in chat, blank preview bugs, and "open/view on my phone" prompts.

## Main Files

- `src/context/useAgentActions.ts`
- `src/context/useWorkspaceActions.ts`
- `src/screens/workspace/hooks/useWorkspaceActions.ts`
- `src/screens/workspace/helpers/chatReplies.ts`
- `src/screens/workspace/inline/chunk23.tsx`
- `src/components/AppWebView.tsx`
- `src/components/AppWebView.web.tsx`
- `src/types/domain.ts`

## Preview Model

`ChatMessage.app` carries preview cards for both cloud-generated inline HTML and desktop-served project previews. `GeneratedApp` can carry either `html` or `url`.

`AppPreviewModal` renders through `AppWebView`, preferring inline `html` and using `url` as fallback. Desktop agent completions attach generated `index.html` from `result.files` when available, so fresh builds do not depend on the LAN preview route.

## Open Behavior

The chat path should not auto-open the preview modal. It should add a tappable preview card, and the modal opens only when the user taps the card.

Explicit preview/open-on-phone intents add the preview card to the assistant reply. Preview trouble prompts like "why is it blank" are handled locally and re-offer the preview card instead of sending a `.vibyra-agent/runs/*.md` question to the agent.

## Intent Routing

`isViewPreviewIntent` in `chatReplies.ts` matches preview/open/view/run wording around website/site/page/app/preview/index.html/html/build plus phrases like "open it on my phone" and bare `preview`.

In project chat with desktop connected, preview intent calls `openProjectPreview(target.projectId, target.project.name)` and replies with `previewOpeningReply(name)` plus a card. Without desktop connection, it uses `previewNotConnectedReply(name)`. In detached chat, it uses `previewNeedsProjectReply()`.

This branch must run before `app.startAgent`; otherwise prompts such as "open the app on my phone" can be mis-treated as code edits.

## Project Preview Guard

`openProjectPreview` checks whether the project id exists in `app.projects` before opening the in-app desktop preview. Unknown restored/adopted projects fall back to opening chat directly to avoid stale desktop `/preview/project/{id}/{token}/` 404 shells.
