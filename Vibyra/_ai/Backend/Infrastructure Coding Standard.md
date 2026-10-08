# Infrastructure Coding Standard

Use this note when changing backend performance, storage, queues, hosting,
readiness, deployment providers, or production configuration.

## Safe baseline

- Repository defaults must run without Redis, S3, or a separate worker:
  artifact mode `database`, queue flag `false`, and database-backed Laravel
  cache/session/queue drivers.
- New provider paths must be opt-in through config and environment variables.
  Never make an external provider mandatory in the same release that adds its
  integration.
- Keep migrations additive and nullable through the observation and rollback
  period. Do not delete legacy data until the new path has completed a staged
  dual-read or dual-write migration.

## Ownership boundaries

- Runtime deployment callers depend on
  `App\Contracts\RuntimeDeploymentProvider`; only the service-container binding
  selects Railway or a future provider.
- Deployment artifact reads/writes go through
  `App\Services\Deployments\DeploymentArtifactStore`. Controllers, jobs, and
  provider traits must not access object storage directly.
- Community listing/status/review queries use the deployment summary scope and
  must not select `demo_files` or other large payloads.
- `/up` is dependency-free liveness. `/ready` is dependency readiness and stays
  outside session middleware.

## Queue rules

- Slow provider/network work belongs in a `ShouldQueue` job on a named queue,
  never in a web request or scheduler loop.
- Jobs must be uniquely keyed where duplicates are unsafe and must retain a
  database-level atomic claim or equivalent idempotency boundary.
- Job timeout must remain lower than Redis `retry_after`; the infrastructure
  preflight enforces this for runtime deployments.
- Failed jobs must leave a terminal, user-visible state and a bounded error;
  worker termination must not leave deployments permanently in progress.

## Artifact rules

- Migration sequence is `database` → `dual` → backfill → verified `object`.
- Object payloads carry version, SHA-256 checksum, size, disk, and key metadata.
  Reads fail closed on missing, malformed, or checksum-mismatched objects.
- Dual-write failure preserves the database copy. Object mode may clear inline
  data only after the object write has been read back and verified.
- Buckets stay private; public content is served through Vibyra routes with the
  existing authorization and response-security headers.

## HTTP and session rules

- Shared caching is allowed only for explicitly anonymous successful GET
  responses. Any authorization header must produce `private, no-store`.
- Public cache responses vary on authorization/origin/encoding as applicable;
  never cache user-specific Community state at the edge.
- Session expiry is checked on every request. Database touch throttling may
  skip only unchanged usage metadata, never revocation, rotation, expiry, IP,
  or user-agent changes.

## Release gate

1. Run `php artisan vibyra:infrastructure-preflight --strict`.
2. Run focused tests for the changed boundary and then `php artisan test`.
3. Run root `npm run typecheck` and `npm run test:mobile` when API contracts or
   client-visible payloads change; run the backend production build for served
   frontend changes.
4. Follow `backend/INFRASTRUCTURE_ROLLOUT.md`; activate one provider boundary
   per release and keep its environment-variable rollback ready.
5. Update `Backend Platform Architecture.md` when ownership, defaults, provider
   choice, activation order, or validation requirements change.
