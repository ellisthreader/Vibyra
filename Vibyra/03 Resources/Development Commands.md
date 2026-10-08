---
type: resource
category: commands
tags:
  - resource/commands
---

# Development Commands

## System Links

- [[03 Resources/Resources|Resources]]
- [[01 Projects/Projects|Projects]]
- [[02 Areas/Development Environment|Development Environment]]

Store only commands that are useful across projects. Project-specific commands belong in that project's home note or memory system.

## Common Checks

```powershell
git status --short
git log -1 --oneline
git branch --show-current
git remote -v
```

## Windows Local Runtime Checks

```powershell
# Identify which process owns a development port.
Get-NetTCPConnection -State Listen -LocalPort 5173, 8787, 8084, 8010 |
  Select-Object LocalAddress, LocalPort, OwningProcess

# Inspect a process before stopping or reusing it.
Get-CimInstance Win32_Process -Filter "ProcessId = 12345" |
  Select-Object ProcessId, Name, CommandLine

# Probe the actual page/API identity.
Invoke-WebRequest http://127.0.0.1:8787/api/health -UseBasicParsing
```

## Common Verification

```powershell
# React/TypeScript/Vite projects - use scripts that exist in package.json.
npm run typecheck
npm test
npm run build

# Laravel projects.
php artisan route:list
php artisan test
```

## Rules

- Confirm cwd, branch, remote, port owner, and page identity before editing.
- Prefer `127.0.0.1` when Windows `localhost`/IPv6 causes local API failures.
- Do not delete `public/hot` or stop a process until its resolved project path is verified.
- Project-specific ports and launch sequences belong in the relevant project memory.

## Related

- [[03 Resources/Repository Checklist|Repository Checklist]]
- [[03 Resources/Codex Lessons Learned|Codex Lessons Learned]]
