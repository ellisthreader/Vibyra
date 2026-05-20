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

Routes: `GET /api/community/projects`, `GET /api/community/projects/{slug}/preview`, `POST /api/projects/publish`, `POST /api/community/projects/{slug}/comments`, and `POST /api/community/projects/{slug}/reaction`. Publishing is rate-limited only after required fields are valid, scoped by user/IP/project id, and allows normal listing retries/updates without the old 3-per-hour global lockout.

The mobile community page loads `GET /api/community/projects` through `src/screens/workspace/hooks/useCommunityPage.ts` and `src/utils/communityApi.ts`. The feed should keep any current/local posts if Laravel is temporarily unreachable instead of clearing to an empty hard-error state; the public community feed has a longer app API timeout in `src/utils/appApi.ts` because cold local Laravel startup can take several seconds.

## Safety

Published project visibility requires `visibility = public` and `review_status = approved`.

`ProjectSafetyReview` runs during publish and can return `approved`, `denied`, or `under_review`. Deterministic checks deny scriptable/embedded/form preview HTML, unsafe URLs, private/local media hosts, and secret-like content. Very large preview HTML or moderation unavailability saves as `under_review` and keeps the project hidden.

Media inputs must be `https://...` URLs or `data:image/{png,jpeg,webp,gif};base64,...`. Do not expose desktop preview bearer URLs, local paths, or raw source trees publicly.

Published HTML is stripped of script tags and inline event handlers and served with a restrictive CSP that intentionally does not set `frame-ancestors`, so the mobile WebView can frame previews.

## Asset Generation

`POST /api/community/assets/generate` is authenticated and credit-metered. Logo generation costs 2 credits; screenshot generation costs 4 credits. OpenAI image generation is used when `OPENAI_API_KEY` is configured, otherwise a deterministic local PNG fallback is returned.

Charges use `CreditDeductor::spend(..., kind: image_generate)` and return refreshed `userPayload`.
