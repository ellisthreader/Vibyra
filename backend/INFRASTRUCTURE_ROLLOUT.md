# Vibyra Backend Infrastructure Rollout

This is the safe activation sequence for the backend seams already present in
the repository. The committed defaults retain the current database-backed,
single-service behavior until each external dependency passes staging.

## Recommended production topology

- Keep the Laravel API on Railway initially. Split the existing service into
  web, deployment worker, and scheduler processes built from the same commit.
- Use managed PostgreSQL in the same primary region as the web and worker. A
  pooled Neon connection is the preferred independent option; Railway
  PostgreSQL is the lowest-migration-risk option.
- Use a TLS Redis/Valkey service for cache, rate-limit locks, sessions, and
  queues. Prefer a same-region Railway Redis service for lowest network risk;
  use Upstash when usage-based scaling and independent operation are more
  important than private-network latency.
- Use Cloudflare R2 through Laravel's S3 disk for deployment artifacts. Keep
  the bucket private and expose files only through Vibyra's authorised routes.
- Put Cloudflare in front of the public API/domain only after authenticated
  routes have a bypass rule. Cache only responses that explicitly return
  `public` cache directives.
- Keep Railway as the first runtime-demo provider. The application now depends
  on `RuntimeDeploymentProvider`, so a second provider can be trialled without
  changing publishing contracts.

## Phase 0 — backups and staging

1. Create an isolated staging Railway environment from the production commit.
2. Take and restore-test a PostgreSQL backup. Record the rollback database URL.
3. Copy production variable names, but use distinct staging secrets, buckets,
   Redis databases, OAuth callbacks, Stripe webhooks, and runtime projects.
4. Run `php artisan vibyra:infrastructure-preflight --strict` and the full test
   suite. Do not continue while either fails.

## Phase 1 — split processes without changing providers

1. Configure a Railway pre-deploy command:
   `php artisan vibyra:infrastructure-preflight --strict && php artisan migrate --force`.
2. Configure web, worker, and scheduler services using the commands in
   `Procfile.production.example`. Only the web service receives a public domain.
3. Give worker and scheduler the same application/database/Redis secrets as the
   web service through Railway references. Use private networking for
   Railway-hosted dependencies.
4. Keep `VIBYRA_RUNTIME_QUEUE_ENABLED=false` for the first deploy. Confirm
   `/up`, `/ready`, login, cloud sync, community browsing, publishing, billing,
   and one static plus one runtime preview.
5. Roll back by routing traffic to the previous web deployment and disabling
   the new worker/scheduler services. Database migrations in this rollout are
   additive and nullable.

The active Railway/Nixpacks configuration calls `scripts/start-production.sh`.
Its default `VIBYRA_PROCESS_ROLE=all` keeps the existing web-plus-scheduler
deployment working. A split deployment must set the role to `web`, `worker`, or
`scheduler` and set `VIBYRA_RUN_MIGRATIONS=0` on every runtime service because
the pre-deploy command owns migrations. Worker timing and queue selection can
be adjusted with `VIBYRA_QUEUE_NAMES`, `VIBYRA_QUEUE_SLEEP`,
`VIBYRA_QUEUE_TRIES`, `VIBYRA_QUEUE_TIMEOUT`, and `VIBYRA_QUEUE_MAX_TIME`.

## Phase 2 — Redis/Valkey

Set these in staging first:

```dotenv
REDIS_CLIENT=predis
REDIS_URL=<tls provider URL>
CACHE_STORE=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_QUEUE_RETRY_AFTER=1500
```

Run the strict preflight, then verify session rotation/revocation, rate limits,
scheduler locks, queue retries, and a worker restart during a deployment. Keep
the database session/cache tables during the observation window so rollback is
an environment-variable change.

## Phase 3 — object artifacts

Install and commit the Laravel S3 adapter before activation:

```bash
composer require league/flysystem-aws-s3-v3 "^3.0" --with-all-dependencies
```

Create a private R2 bucket and S3-scoped credentials, then configure the `s3`
disk endpoint, bucket, region, key, and secret. Activate safely:

1. Set `VIBYRA_DEPLOYMENT_ARTIFACT_MODE=dual` and
   `VIBYRA_DEPLOYMENT_ARTIFACT_DISK=s3`.
2. Run `php artisan vibyra:backfill-deployment-artifacts` repeatedly until it
   reports no remaining database artifacts to copy.
3. Verify static and runtime previews, checksum rejection, deletion, and bucket
   lifecycle rules in staging.
4. Set `VIBYRA_DEPLOYMENT_ARTIFACT_MODE=object`. Observe error rate and object
   reads before removing any legacy database payloads.
5. Roll back immediately to `dual` or `database`; dual-write failures preserve
   the database copy and object-mode reads verify checksums.

## Phase 4 — queued runtime deployments

Set `VIBYRA_RUNTIME_QUEUE_ENABLED=true` only after the dedicated worker is
healthy. Confirm the deployments queue is being consumed, a duplicate dispatch
does not deploy twice, and failed jobs reach a terminal failed state. The
existing atomic status claim is the second idempotency boundary. Roll back by
setting the flag to `false`; the scheduled command resumes synchronous handling.

## Phase 5 — edge and database tuning

1. Enable Cloudflare proxying and cache anonymous community GET responses only.
   Never cache requests with `Authorization` or session cookies.
2. Use the pooled PostgreSQL connection for web and worker services. Keep a
   direct connection available for migrations if the provider recommends it.
3. Size the database minimum compute to hold the active working set; avoid
   scale-to-zero on production if login/API cold-start latency is unacceptable.
4. Add continuous external checks for `/up` and `/ready`; the platform deploy
   healthcheck is not continuous monitoring.

## Release gate

Promote only after 24 hours of staging soak with no failed readiness checks,
no stuck deployments, no checksum errors, stable queue depth, and successful
restore/rollback drills. Change one provider boundary per release.
