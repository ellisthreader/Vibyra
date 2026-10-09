# Local build-tooling security backports

These are local fixes for GHSA-vfj7-8cjw-p6xm (braces 3.0.3) and
GHSA-86w9-cpqp-85rv (node-forge 1.4.0). Official registry versions, URLs,
integrity strings and installed licenses remain unchanged. npm audit still
reports these versions as vulnerable; this is not an official patched release.

`npm ci --prefix mobile` invokes the self-contained mobile postinstall. The
applicator uses only Node built-ins, never downloads or executes patch commands,
and checks every matching lock entry and installed manifest plus exact
before/after file SHA256. It rejects symlinks, unknown versions, drifted source
and ambiguous replacements before writing any input. Exact already-patched
files are accepted; interrupted application can be retried. This assumes an
exclusive package installation, not a concurrently hostile local filesystem.

`npm run test:build-tooling --prefix mobile` verifies all installed leaves and
runs bounded malicious/valid crypto vectors, glob/AST regressions, installer
failure tests and actual Metro/Expo consumer smoke. Desktop preverify runs this
gate too; the workflow that deliberately installs with `--ignore-scripts`
explicitly applies it first. A skipped postinstall fails the verification gate.

Braces retains its expansion algorithms and configurable existing range limits.
Actual curly/parentheses parse nesting, AST child and parent chains, append and
flatten recursion receive a non-disableable depth ceiling of 128. Excessive
nesting and cycles fail with a deliberate SyntaxError. Malformed plain-data AST
shapes/accessors fail before recursive traversal. Normal parent pointers and
shared children are allowed. This does not sandbox arbitrary JavaScript Proxy
objects or limit exponential expansion when callers disable existing range
limits; those are separate API policies.

Forge uses the exact nested DigestAlgorithm child-count condition in upstream
PR 1152 commit ceba34402e329f0365134f23fe19898756527d65. The two executable
browser bundles receive the same single mapped guard. Their original source
maps are retained upstream debug metadata; they do not execute and do not
represent the modified guard. The prime worker contains no signature verifier.
No crypto primitive, digest choice, padding or PSS behavior is changed.

Provenance and checksums live in `provenance.json` and `patches.json`. Upstream
licenses remain in each installed package. Replace these backports only after
reviewing an official fixed release; unknown dependency updates intentionally
stop installation rather than silently losing the protection.
