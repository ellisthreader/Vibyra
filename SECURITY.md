# Security Policy

## Reporting A Vulnerability

Use GitHub private vulnerability reporting for this repository. Do not open a
public issue or include credentials, exploit details, customer data, or
production logs in a pull request.

Include:

- affected component and version or commit;
- reproduction steps and prerequisites;
- security impact and likely attack path;
- proof-of-concept material with secrets and personal data removed;
- any known mitigations.

Maintainers should acknowledge a report within two business days, establish
severity and ownership, preserve relevant evidence, and coordinate disclosure
after a fix is available. Active credential exposure or production compromise
requires immediate provider-side revocation and incident response; repository
automation cannot perform that revocation.

## Supported Versions

Security fixes target the current production release and the default branch.
Older mobile, desktop, and backend versions may be required to upgrade when a
fix changes the LAN protocol, native security configuration, or session format.

## Release Security

Automated checks live under `.github/workflows/` and
`scripts/security/audit-production-config.mjs`. They do not prove that external
controls are configured. Every production release must also satisfy the manual
evidence gates in `docs/security/production-release-gates.md`.
