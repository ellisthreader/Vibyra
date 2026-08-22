# Backend Platform Architecture

Use this note for cloud-provider, backend scaling, database/cache/queue, object
storage, or production-runtime reviews. It records architecture boundaries, not
a commitment to a particular replacement provider.

## Current Production Shape

- Mobile and desktop clients default to
  `https://vibyra-production.up.railway.app` in `src/utils/appApiOrigins.ts` and
  `desktop/lib/appApiConfig.mjs`.
- The Railway service builds and serves the Laravel backend and marketing
  assets. `backend/railway.json`, `backend/nixpacks.toml`, and `backend/Procfile`
  currently start `php artisan serve`, run migrations during web startup, and
  background `php artisan schedule:work` in the same container.
- The scheduler polls queued runtime-demo deployments every minute. The command
  calls `RailwayRuntimeDeploymentService` synchronously; provider upload,
  status/domain discovery, and public readiness polling can occupy that process
  for minutes.
- Repository defaults put the database, cache, sessions, queue, and rate-limit
  locks on the relational database. Production database resources are controlled
  by environment variables and cannot be inferred from committed config alone.
- Existing runtime/static artifacts remain in database columns by default.
  `DeploymentArtifactStore` supports `database`, `dual`, and checksum-verified
  `object` modes; `vibyra:backfill-deployment-artifacts` performs safe copies.

## Confirmed Scaling Risks

- Community deployment summaries omit `demo_files` while retaining metadata
  and safe HTML needed for capability checks. Do not reintroduce full artifact
  loading into listing, status, or review-queue queries.
- `SessionAuthenticator` throttles unchanged session metadata touches using
  `VIBYRA_SESSION_TOUCH_INTERVAL_SECONDS` (default 300). Expiry remains checked
  on every request and metadata changes still write immediately.
- `useCloudSync` debounces for 700 ms but rewrites the user's combined
  `app_state` JSON whenever broad mobile state changes. Growing chat/project
  state will amplify row size, write cost, and conflict risk.
- Anonymous community GET responses use a session-free route and explicit
  shared-cache headers; authenticated responses remain `private, no-store`.
- Runtime deployment has a unique queue job and dedicated queue, gated by
  `VIBYRA_RUNTIME_QUEUE_ENABLED=false`; synchronous behavior stays the default.
- MaxMind updates write to scheduler-local storage, so web replicas would not
  receive the database after an ephemeral/split-process migration.
- Generated Railway demo config does not opt into provider sleep/serverless
  behavior, so successful runtime demos should be treated as persistent services
  unless the provider is configured separately.

## Preferred Responsibility Split

Keep the Laravel domain model and API. Optimize boundaries before attempting a
BaaS rewrite:

1. Stateless web/API compute with production PHP serving and deploy-time config,
   route, and view caches.
2. A managed relational database matching the current production engine first;
   rehearse any later engine change independently.
3. Redis/Valkey for cache, rate-limit locks, session acceleration, and durable
   Laravel queues, with deployment work handled by a separate worker.
4. S3-compatible object storage/CDN for runtime bundles, screenshots, static
   demos, and releases; database rows keep object keys and metadata only.
5. A provider adapter for interactive demo runtimes. Evaluate scale-to-zero,
   programmatic lifecycle control, isolation, egress policy, build support, and
   cold-start behavior separately from primary Laravel hosting.

## Implemented Migration Guards

- `/up` remains dependency-free liveness. `/ready` is registered outside web
  session middleware and checks the database plus opt-in cache/storage probes.
- `vibyra:infrastructure-preflight` rejects production SQLite, debug/HTTP
  configuration, and selected Redis/S3 drivers without their runtime adapters.
- Scheduled tasks use `onOneServer()` and explicit overlap-lock lifetimes; keep
  one active scheduler until deployment work is made an idempotent queue job.
- Cloud state allowlists remembered-desktop metadata server-side so local
  desktop bearer credentials cannot be persisted even from a faulty client.
- `RuntimeDeploymentProvider` isolates callers from Railway, which remains the
  bound provider until an alternative passes staging.
- Windows trusted-path checks normalize separators/case while still requiring
  decoded desktop project IDs to resolve under the actual user home.
- Do not activate Redis, S3/R2, split processes, or a new host until the
  corresponding managed service and rollback path pass staging checks.

## Activation Runbook

`backend/INFRASTRUCTURE_ROLLOUT.md` is the operational source of truth. It uses
additive migrations and disabled flags, recommends split Railway web/worker/
scheduler services, pooled PostgreSQL, TLS Redis/Valkey, and private R2, and
requires a 24-hour staging soak plus rollback drills. The non-active process
commands live in `backend/Procfile.production.example`; the current production
start command remains unchanged.

Repository configuration was audited after implementation: the Railway binding,
safe feature-flag defaults, environment examples, readiness route, commands,
and additive artifact migration are internally consistent. Follow
`Infrastructure Coding Standard.md` for future changes.

## Start Files

- `backend/railway.json`, `backend/nixpacks.toml`, `backend/routes/console.php`
- `backend/config/{database,cache,queue,session,filesystems}.php`
- `backend/app/Services/Deployments/RailwayRuntimeDeploymentService.php`
- `backend/app/Services/Deployments/Concerns/HandlesRailwayDeploymentWorkflow.php`
- `backend/app/Http/Controllers/Concerns/CommunityPublishingReadEndpoints.php`
- `backend/app/Services/Auth/SessionAuthenticator.php`
- `src/context/useCloudSync.ts`
