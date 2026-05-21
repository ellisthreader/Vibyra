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

Routes: `GET /api/community/projects`, `GET /api/community/projects/{slug}/preview`, authenticated `GET /api/projects/publish-status`, reviewer-only `GET /api/projects/review-queue`, reviewer-only `POST /api/projects/{slug}/review`, `POST /api/projects/publish`, `POST /api/community/projects/{slug}/comments`, and `POST /api/community/projects/{slug}/reaction`. Publishing is rate-limited only after required fields are valid, scoped by user/IP/project id, and allows normal listing retries/updates without the old 3-per-hour global lockout. Reviewers are allowlisted through `moderation.publish_reviewer_emails` / `VIBYRA_PUBLISH_REVIEWER_EMAILS`.

`POST /api/projects/publish` updates the existing `published_projects` row for a user's `source_project_id`. Pending/under-review rows are allowed to be republished so the current deterministic review can recheck them with a fresh source bundle and approve safe projects without human review or AI cost.

When building the Vibyra website/admin area, include an admin dashboard for under-review projects. It should consume the reviewer-only review queue, show safety score/rating/findings/summary, and let allowlisted reviewers approve or deny projects from the web UI.

The mobile community page loads `GET /api/community/projects` through `src/screens/workspace/hooks/useCommunityPage.ts` and `src/utils/communityApi.ts`. The feed should keep any current/local posts if Laravel is temporarily unreachable instead of clearing to an empty hard-error state; the public community feed has a longer app API timeout in `src/utils/appApi.ts` because cold local Laravel startup can take several seconds.

## Safety

Published project visibility requires `visibility = public` and `review_status = approved`.

`ProjectSafetyReview` runs during publish and can return `approved`, `denied`, or `under_review`. Deterministic checks deny truly unsafe preview/content such as dangerous embeds, JavaScript URLs, inline executable script content, unsafe/private media hosts, credential/key files, and secret-like content. Normal UI controls such as buttons/inputs/selects are allowed/sanitized instead of hard-denied, and normal local build script tags like `<script src="/assets/app.js">` are stripped from the stored preview without blocking publication. It assigns weighted `safety_score` / `safety_rating` values for source snapshot quality, large previews, external network calls, sensitive browser APIs, install scripts, encoded/minified blobs, dynamic code execution, shell/destructive operations, wallet/crypto behavior, tracking/fingerprinting, and moderation unavailability. Confidence gaps such as missing source or moderation outage should produce `needs_review`, not `high_risk`, unless combined with actual dangerous findings.

Low-score deterministic `under_review` cases can be escalated to the cheap AI reviewer service `ProjectAiSafetyReview` when `PUBLISH_REVIEW_AI_ENABLED` and `OPENROUTER_API_KEY` are available. The AI path defaults to `openai/gpt-5.4-nano`, sends only a compact evidence pack, caps input/output, never runs for hard deterministic denials, skips missing source snapshots, skips projects over `PUBLISH_REVIEW_AI_MAX_SOURCE_FILES` / `PUBLISH_REVIEW_AI_MAX_SOURCE_CHARACTERS`, and can auto-approve/deny only when confidence and score thresholds pass. Oversized projects remain under human review to control cost.

Publishing now carries a bounded source review snapshot from Vibyra Desktop (`GET /files/review-bundle`) through mobile `src/screens/workspace/inline/chunk8.tsx` into `POST /api/projects/publish` as `sourceFiles` plus `sourceReview`. The backend does not store source bodies; it persists only `review_flags`, `review_reason`, `review_summary`, `safety_rating`, and `safety_score` on `published_projects`.

Media inputs must be `https://...` URLs or `data:image/{png,jpeg,webp,gif};base64,...`. Do not expose desktop preview bearer URLs, local paths, or raw source trees publicly.

Published HTML is stripped of script tags and inline event handlers and served with a restrictive CSP that intentionally does not set `frame-ancestors`, so the mobile WebView can frame previews.

## Asset Generation

`POST /api/community/assets/generate` is authenticated and credit-metered. Logo generation costs 2 credits; screenshot generation costs 4 credits. OpenAI image generation is used when `OPENAI_API_KEY` is configured, otherwise a deterministic local PNG fallback is returned.

Charges use `CreditDeductor::spend(..., kind: image_generate)` and return refreshed `userPayload`.
