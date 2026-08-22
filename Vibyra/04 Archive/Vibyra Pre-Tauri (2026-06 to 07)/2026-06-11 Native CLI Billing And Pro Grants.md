---
title: Native CLI Billing And Pro Grants
type: run
project: Vibyra
date: 2026-06-11
status: complete
tags:
  - ai/runs
  - project/vibyra
  - billing
  - terminal
---

# 2026-06-11 Native CLI Billing And Pro Grants

> [!info] AI quick context
> Durable run summary for Vibyra native CLI billing proof, exhausted-credit diagnostics, terminal setup preservation, and manual Pro membership grants.

## Outcome

Vibyra tokens were confirmed to support genuine company CLIs through Vibyra's
protected OpenRouter transport. Native Grok Build 0.2.39 was live-proven
end-to-end with exact-model billing, no raw OpenRouter key in the child
environment, and a successful authoritative PTY response.

The reported Grok failure was not an adapter or company CLI key failure. The
authenticated production account had zero Vibyra credits and a full weekly
window, so backend billing correctly rejected the request before OpenRouter
dispatch.

## Architecture Confirmed

- The user selects `Vibyra tokens`; OpenRouter remains an internal transport,
  not a separate token-source choice.
- Native provider CLIs receive a short-lived, terminal-scoped local gateway
  token.
- The desktop gateway translates each native protocol to the authenticated
  backend `/api/codex/responses` route.
- Laravel reserves Vibyra credits and quota before provider dispatch.
- The backend-owned `OPENROUTER_API_KEY` is never passed to the native CLI.
- The exact selected billing model is persisted in the terminal grant and
  settled in `chat_cost_reservations` and `credit_ledger`.

## Live Grok Proof

A disposable local Vibyra account was upgraded to funded Starter state and
used against the real configured backend OpenRouter transport.

- Runtime: Grok Build 0.2.39
- Selected/billed model: `x-ai/grok-build-0.1`
- Native protocol: OpenAI Chat Completions
- Launch contract: 22
- Billing mode: `vibyra`
- Prompt result: `VIBYRA_GROK_FUNDED_ROUTE_OK`
- Reservation result: settled successfully
- Ledger surface/outcome: `desktop-terminal` / `success`
- Balance change: 500 to 496 credits
- Child environment contained `VIBYRA_TERMINAL_GATEWAY_TOKEN`
- Child environment did not contain `OPENROUTER_API_KEY`

The disposable account, terminal, and local proof services were removed after
verification.

## Billing Error Fix

`billing_credits_exhausted` remains fail-closed and does not bypass Vibyra
billing. The error now:

- identifies the Vibyra token balance;
- reports the estimated credits needed when known;
- reports monthly and weekly reset/capacity data when known;
- explicitly states that the company CLI API key is not the problem;
- remains non-retryable in native CLI protocol envelopes.

Primary files:

- `backend/app/Services/Billing/ChatCostQuotaGuard.php`
- `desktop/lib/desktopBillingErrors.mjs`
- `desktop/lib/desktopNativeTerminalGateway.mjs`
- `backend/tests/Feature/VibyraCodexResponsesApiTest.php`
- `desktop/lib/desktopNativeTerminalGateway.test.mjs`

The real production account with zero balance was rechecked after the bridge
refresh. Grok displayed the corrected Vibyra billing explanation before any
OpenRouter dispatch.

## Terminal Setup Preserved

Solo terminal setup continues to support 1-12 terminals, including presets,
custom count, and the truthful grid preview. Team remains a separate 2-4 role
topology and does not inherit Solo's arbitrary count.

The active bridge was refreshed on port 4317 and confirmed:

- terminal action protocol `2026-06-11.16`;
- AI terminal launch contract `22`;
- one current bridge listener after stale processes were removed.

## Verification

- 12/12 native gateway and Codex billing tests passed.
- 17/17 backend Responses and billing feature tests passed.
- 31/31 terminal setup/model/Team tests passed.
- Live native Grok funded routing passed.
- Live exhausted-production-account error rendering passed.
- `git diff --check` passed for the changed billing/terminal files.

## Production Manual Membership Grants

Two explicitly requested production accounts received manual annual Pro
entitlements through Railway's deployed service container:

- Production user 2: annual Pro, 2,000-credit refresh, membership through
  June 11, 2027.
- Production user 5: `ellis.threader3001@gmail.com`, annual Pro,
  2,000-credit refresh, membership through June 11, 2027.

For both grants:

- `billing_provider` is `manual`;
- `membership_cancel_at_period_end` is false;
- burst and weekly usage windows were reset;
- current OpenRouter spent/reserved counters were reset;
- `CreditDeductor::refresh()` wrote an auditable `refresh` ledger entry with
  `source=manual.admin`, `plan=pro`, and `cycle=annual`.

No bearer token, terminal gateway credential, provider API key, or database
password is recorded in this note.

## Durable Diagnostic Rule

When a native company CLI returns `billing_credits_exhausted`, inspect the
authenticated Vibyra account balance and quota windows first. That code proves
the request reached Vibyra's backend billing guard; it does not prove the
provider CLI key or adapter is invalid. Prove routing separately with a funded
account, exact-model settlement, authoritative PTY output, and child credential
inspection.
