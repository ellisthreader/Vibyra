# Production Security Release Gates

Production is blocked until every automated check passes and each manual gate
has dated evidence, an owner, and an approver independent of the implementer.
Do not store secret values in the evidence record.

## Automated Gates

1. `Security CI` passes tests, dependency audits, secret history scanning, and
   produces a CycloneDX SBOM.
2. `Dependency Review` reports no newly introduced high or critical vulnerable
   dependency.
3. `CodeQL` has no unresolved high or critical result.
4. `Production Security Gate` passes against the protected GitHub `production`
   environment and uploads `production-security-audit.json`.
5. Release artifacts are built from the exact protected commit covered by the
   successful checks.

Local equivalents:

```bash
node scripts/security/audit-production-config.mjs --ci
node --test scripts/security/audit-production-config.test.mjs
node scripts/security/audit-production-config.mjs \
  --release --env-file /secure/path/production.env
```

The audit reports only variable names and outcomes. It never prints configured
secret values.

## Manual Gates

| Gate | Required evidence |
| --- | --- |
| Secret incident | Open secret-scanning alerts are resolved; exposed keys are revoked or proven false positives; provider audit confirms replacement credentials. |
| Branch protection | Export or screenshot showing PR-only `main`, required security checks, restricted bypass, and two reviewers for security-sensitive changes. |
| Deployment protection | GitHub `production` environment has independent required reviewers, deployment-branch restrictions, and no unreviewed admin bypass. |
| Environment isolation | Staging and preview cannot access production data, billing credentials, signing credentials, or backend secrets. |
| Artifact signing | IPA, AAB, and desktop artifacts have recorded hashes and verified Apple, Play, desktop signing/notarization identities tied to the protected commit. |
| Backup and recovery | Encrypted backup status plus a successful isolated restore drill meeting approved RPO and RTO. |
| Migration rollback | Pre-deploy snapshot identifier and a rehearsed application/database rollback without data loss. Startup-time migrations alone are not a rollback plan. |
| Monitoring | Alert test covers authentication abuse, privilege changes, credential revocation, billing replay, security flag changes, and production audit failures. |
| Incident response | Current contact tree, severity matrix, evidence-preservation procedure, notification decision process, and dated tabletop exercise. |
| Physical devices | Production-signed iOS and Android builds pass the maintained device matrix, MITM/replay tests, recovery links, WebView isolation, and credential revocation. |
| Independent pentest | Mobile, API, desktop/LAN, WebView/preview, authorization, and billing scope has zero open Critical or High findings after retest. |

## GitHub Configuration

Repository administrators must configure these controls outside the repository:

1. Enable private vulnerability reporting, secret scanning, push protection,
   Dependabot alerts, and Dependabot security updates.
2. Create a ruleset for `main` requiring pull requests, CodeQL, Dependency
   Review, and Security CI. Require conversation resolution and prevent force
   pushes and deletion.
3. Create a `production` environment with independent reviewers and restrict it
   to protected release refs.
4. Populate production environment variables and secrets referenced by
   `.github/workflows/production-security-gate.yml`.
5. Retain release audit, SBOM, signing, restore, rollback, and pentest evidence
   according to the incident-response and compliance retention policy.

CODEOWNERS requests review but does not enforce approval without a ruleset.
The production workflow referencing an environment does not prove that required
reviewers or deployment restrictions are enabled.
