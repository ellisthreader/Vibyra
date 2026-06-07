# Backend - Community Publishing

Read this for published projects, comments, reactions, preview safety, and generated community assets.

## Files

- `backend/app/Http/Controllers/Concerns/CommunityPublishing.php`
- `backend/app/Services/Community/ProjectSafetyReview.php`
- `backend/app/Services/Community/CommunityPublishMedia.php`
- `backend/app/Services/Community/CommunityAssetGeneration.php`
- `backend/app/Services/Community/CommunityAssetGenerator.php`
- `backend/tests/Feature/CommunityPublishingTest.php`

## Routes

Laravel owns public published project data through `published_projects`, `published_project_comments`, and `published_project_reactions`.

Routes: `GET /api/community/projects`, `GET /api/community/projects/{slug}/preview`, authenticated `GET /api/projects/publish-status`, authenticated `PATCH /api/projects/{slug}/publish`, authenticated `DELETE /api/projects/{slug}/publish`, reviewer-only `GET /api/projects/review-queue`, reviewer-only `POST /api/projects/{slug}/review`, `POST /api/projects/publish`, `POST /api/community/projects/{slug}/comments`, and `POST /api/community/projects/{slug}/reaction`. Publishing is rate-limited only after required fields are valid, scoped by user/IP/project id, and allows normal listing retries/updates without the old 3-per-hour global lockout. Reviewers are allowlisted through `moderation.publish_reviewer_emails` / `VIBYRA_PUBLISH_REVIEWER_EMAILS`.

`POST /api/projects/publish` updates the existing `published_projects` row for a user's `source_project_id`. Pending/under-review rows are allowed to be republished so the current deterministic review can recheck them with a fresh source bundle and approve safe projects without human review or AI cost.

Owner listing management, 2026-06-06: `GET /api/projects/publish-status` returns owner-only listing metadata (`id` slug, description, tags, image URLs, visibility, `viewerCanManage`). Authenticated `GET /api/community/projects` marks the viewer's own public listings with `viewerCanManage` and `sourceProjectId`; unauthenticated/public calls return `viewerCanManage=false`. Mobile uses this to show Projects-menu `Edit listing` / `Delete listing` and Explore-detail owner actions. `PATCH /api/projects/{slug}/publish` only changes visibility for the owner, and `DELETE /api/projects/{slug}/publish` deletes the owner's published listing without deleting the local/mobile project.

When building the Vibyra website/admin area, include an admin dashboard for under-review projects. It should consume the reviewer-only review queue, show safety score/rating/findings/summary, and let allowlisted reviewers approve or deny projects from the web UI.

The mobile community page loads `GET /api/community/projects` through `src/screens/workspace/hooks/useCommunityPage.ts` and `src/utils/communityApi.ts`. The feed should keep any current/local posts if Laravel is temporarily unreachable instead of clearing to an empty hard-error state; the public community feed has a longer app API timeout in `src/utils/appApi.ts` because cold local Laravel startup can take several seconds.

## Safety

Published project visibility requires `visibility = public` and `review_status = approved`.

`ProjectSafetyReview` runs during publish and can return `approved`, `denied`, or `under_review`. Deterministic checks deny truly unsafe preview/content such as dangerous embeds, JavaScript URLs, inline executable script content, unsafe/private media hosts, credential/key files, and secret-like content. Normal UI controls such as buttons/inputs/selects are allowed/sanitized instead of hard-denied, and normal local build script tags like `<script src="/assets/app.js">` are stripped from the stored preview without blocking publication. It assigns weighted `safety_score` / `safety_rating` values for source snapshot quality, large previews, external network calls, sensitive browser APIs, install scripts, encoded/minified blobs, dynamic code execution, shell/destructive operations, wallet/crypto behavior, tracking/fingerprinting, and moderation unavailability. Confidence gaps such as missing source or moderation outage should produce `needs_review`, not `high_risk`, unless combined with actual dangerous findings.

Temporary local testing flag (2026-05-21): `moderation.publish_force_approve_under_review` / `PUBLISH_REVIEW_FORCE_APPROVE_UNDER_REVIEW=true` force-approves publish requests after deterministic safety and local text moderation, skipping remote moderation/AI review so testing stays fast. Hard deterministic or local moderation `denied` decisions still block. Remove or disable this after testing instant publishing.

Local Explore empty after publishing, 2026-06-06: if publishes save but do not appear in Explore, query `published_projects` for `visibility` and `review_status`. Explore only lists `visibility=public` and `review_status=approved`; local publishes with `source_snapshot_missing` or `moderation_unavailable` stay `under_review` unless `PUBLISH_REVIEW_FORCE_APPROVE_UNDER_REVIEW=true` is enabled and Laravel config is cleared. The mobile app reads root `.env` `EXPO_PUBLIC_API_URL`; verify that LAN URL returns `/api/community/projects` because Railway production and local SQLite can have different project lists.

Explore fake preview bug, 2026-06-06: do not approve/list a public project as openable unless it has `preview_html` or a successful `published_project_deployments` row. Approved rows with no preview/deployment previously opened `/preview`, which generated a title/description placeholder such as "Laravel project built with Vibyra" and looked like a fake app. `CommunityPublishing::communityProjects` now filters those rows out, `publishProject` rejects public approved publishes without preview/demo payload, and `/preview` returns an explicit unavailable page when no HTML was captured.

Source preview shell bug, 2026-06-06: Vibyra's generated source-code preview HTML (`<h2>Project preview</h2>` with `<pre><code>...`) must not count as a public live app preview. `CommunityPublishingPayload::isOpenablePreviewHtml` now rejects that shell for stored `preview_html` and static `demo_html`; `publishProject` rejects public approved publishes where the only captured payload is that source shell. This prevents folders such as config/backend-only projects from appearing in Explore as "ready" when users would only see source snippets.

Explore private runtime guard, 2026-06-06: public Explore payloads must never expose localhost, `127.0.0.1`, private LAN IPs, `.local`/`.lan`/`.internal`, desktop bridge, or other non-HTTPS runtime URLs. `CommunityPublishingPayload` now treats a deployment as openable only when it is a Vibyra static demo route or a safe HTTPS public URL; otherwise `publicUrl`/`appUrl` are `null` or fall back to safe captured preview HTML. `CommunityPublishing` filters old unsafe rows out of `GET /api/community/projects`, `/demo` only serves Vibyra static demo bundles, and hosted demo bundles containing private URLs are rejected before listing.

Compiled static fallback acceptance, 2026-06-07: a valid built frontend can contain a development API fallback such as `const API_BASE="http://localhost:8010"` even though its public static preview remains openable with network access disabled. `CommunityPublishing::normalizeHostedDemoBundle` now neutralizes private-host URL literals to `about:blank` only inside compiled `.js`/`.mjs`/`.cjs` demo assets before validation and storage. Private URLs in HTML/CSS, public deployment URLs, and runtime source bundles remain rejected. Keep regression coverage in `CommunityPublishingHostedDemoTest::test_hosted_demo_bundle_neutralizes_compiled_local_api_fallback`.

Low-score deterministic `under_review` cases can be escalated to the cheap AI reviewer service `ProjectAiSafetyReview` when `PUBLISH_REVIEW_AI_ENABLED` and `OPENROUTER_API_KEY` are available. The AI path defaults to `openai/gpt-5.4-nano`, sends only a compact evidence pack, caps input/output, never runs for hard deterministic denials, skips missing source snapshots, skips projects over `PUBLISH_REVIEW_AI_MAX_SOURCE_FILES` / `PUBLISH_REVIEW_AI_MAX_SOURCE_CHARACTERS`, and can auto-approve/deny only when confidence and score thresholds pass. Oversized projects remain under human review to control cost.

Publishing now carries a bounded source review snapshot from Vibyra Desktop (`GET /files/review-bundle`) through mobile `src/screens/workspace/inline/chunk8.tsx` into `POST /api/projects/publish` as `sourceFiles` plus `sourceReview`. The backend does not store source bodies; it persists only `review_flags`, `review_reason`, `review_summary`, `safety_rating`, and `safety_score` on `published_projects`.

Media inputs must be `https://...` URLs or `data:image/{png,jpeg,webp,gif};base64,...`. Do not expose desktop preview bearer URLs, local paths, or raw source trees publicly.

Published HTML is stripped of script tags and inline event handlers and served with a restrictive CSP that intentionally does not set `frame-ancestors`, so the mobile WebView can frame previews.

Community comments are public user-generated content and must pass `ContentModeration::assertModerationInputAllowed(..., 'community.comment', false)` before a `published_project_comments` row is created. Local moderation is controlled by `moderation.local_enabled` / `LOCAL_MODERATION_ENABLED` and remains active even when OpenAI remote moderation is disabled through `moderation.remote_enabled` / `OPENAI_MODERATION_ENABLED`; remote outages fail open only after local blocked terms, obfuscation patterns, and spam heuristics run. Keep endpoint-level coverage in `CommunityPublishingCoreTest` for rejected comments before saving.

## Asset Generation

`POST /api/community/assets/generate` is authenticated and credit-metered. Logo generation costs 12 credits; screenshot generation costs 20 credits. `CommunityAssetGenerator` uses OpenRouter (`OPENROUTER_API_KEY`, `services.openrouter.image_model`, default `openai/gpt-5.4-image-2`) through the multimodal chat endpoint and returns a data-image or HTTPS URL. There is no deterministic local fallback.

Charges use `CreditDeductor::spend(..., kind: image_generate)` only after a successful image response and return refreshed `userPayload`.
