# Cloud runtime 34dd source

This self-contained build context preserves the audited frozen source for image
`sha256:34dd54e6db281990790f4c00b0b063273e31bd8511fe96d1a5703cc8604416ec`.
The Dockerfile inherits pinned runtime base fd4c and replaces the compiled Host
and two login modules. This source record does not deploy or rebuild that image.

From this directory, one command prepares the synthetic detector corpus,
verifies its exact SHA256, then invokes the unchanged build:

```sh
node scripts/materialize-secret-guard-fixtures.mjs -- docker build --file Dockerfile .
```

For login tests:

```sh
node scripts/materialize-secret-guard-fixtures.mjs -- node --test cloud-runtime/tests/sync-login.test.mjs
```

`--check` verifies fixture construction without writing. The original literal
corpus is deliberately untracked and ignored; deterministic named factories and
a readable template recreate its exact bytes before tests/build. No secret
scanner exemptions are required. The shared corpus SHA256 is
`0a6023246fbfffd9edc4741da42455fe462e2827ebc5a2667053f3843e8d22b3`.
Do not force-add the materialized fixture JSON.
