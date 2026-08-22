---
title: Vibyra Gemini Terminal Recovery
type: run
project: Vibyra
date: 2026-06-10
status: complete
tags:
  - ai/runs
  - project/vibyra
  - terminal
---

# Vibyra Gemini Terminal Recovery - 2026-06-10

> [!info] AI quick context
> Durable run summary for Vibyra native Gemini terminal recovery: production URL routing, Gemini auth/profile handling, multi-turn protocol translation, and quota reservation accounting.

Scope: Vibyra-token native terminals, production OpenRouter billing, Gemini CLI
authentication, multi-turn translation, and burst reservation behavior.

## Final Contract

- Vibyra-token terminals run the selected provider's real native CLI.
- Provider CLIs receive short-lived terminal-bound credentials, never the
  backend OpenRouter key.
- Account verification, Auto routing, chat, project memory, Responses,
  Anthropic, and Gemini proxies all use `desktopAppApiUrl()`.
- Production billing and provider calls remain server-side.
- Concrete Vibyra-credit terminals require a verified desktop account.

## Root Causes And Fixes

1. Valid production account tokens were sent to a localhost Laravel backend by
   terminal proxies with independent URL defaults. The local database returned
   false login-expired errors before OpenRouter was called.
   - Replaced proxy defaults with `desktopAppApiUrl()`.
   - Covered Responses, native terminal, desktop chat, and project memory.

2. Managed Gemini initially stopped on authentication.
   - Gemini CLI 0.46 supports custom gateway transport, but its interactive
     validator rejects `gateway` as the selected auth method.
   - Managed profiles now enforce `gemini-api-key`, set
     `GOOGLE_GEMINI_BASE_URL` to Vibyra's local Gemini gateway, and set
     `GEMINI_API_KEY` to the terminal-scoped credential.
   - Added `geminiProfileVersion` so bridge recovery retires only workers using
     an incompatible managed Gemini profile.

3. Gemini worked on the first prompt but later prompts returned
   `Invalid Responses API request`.
   - Native prior assistant messages were replayed as Responses `output_text`.
   - Historical Gemini and Anthropic text is request input and is now always
     encoded as `input_text`.
   - Function-call IDs and provider protocol translation remain preserved.

4. Tiny Gemini prompts were rejected at `12/15` burst usage.
   - Gemini CLI sends roughly 49 KB of static system/tool context for a simple
     prompt. A conservative balance reservation for that context plus a
     2,000-token maximum answer required seven credits and falsely consumed
     burst admission capacity.
   - Reservations now separate the conservative balance/monthly USD hold from
     burst/weekly quota admission.
   - Terminal quota uses unsafed expected usage with
     `terminal_quota_output_tokens = 256`.
   - Reservation metadata stores `quota_reserved_credits`; release and
     settlement reconcile quota and balance to exact provider usage.
   - Final charges and hard quota limits were not weakened.

## Important Files

- `desktop/lib/appApiConfig.mjs`
- `desktop/lib/desktopCodexResponses.mjs`
- `desktop/lib/desktopNativeTerminalGateway.mjs`
- `desktop/lib/desktopNativeTerminalProtocol.mjs`
- `desktop/lib/aiTerminalVibyraShell.mjs`
- `desktop/lib/aiTerminalPersistentProcess.mjs`
- `desktop/lib/ptyTerminals.mjs`
- `backend/app/Http/Controllers/Concerns/CodexResponsesEndpoint.php`
- `backend/app/Http/Controllers/Concerns/NativeTerminalEndpoint.php`
- `backend/app/Services/Billing/CreditCalculator.php`
- `backend/app/Services/Billing/ChatCostReservationService.php`
- `backend/app/Services/Billing/ChatCostSettlementService.php`
- `backend/app/Services/Billing/ChatCostQuotaGuard.php`

## Verification

- Shared production routing:
  - 75 focused desktop tests passed.
  - 25 backend terminal/billing tests passed.
  - Local Gemini gateway returned HTTP 200 and `OK` through production.
- Gemini authentication:
  - 37 focused PTY, persistence, environment, and gateway tests passed.
  - Installed Gemini CLI returned `AUTH_OK`.
  - Interactive terminal reached `providerState: ready` without an auth dialog.
- Multi-turn translation:
  - 11 focused protocol/gateway tests passed.
  - A formerly rejected three-message request returned `HISTORY_OK`.
  - An existing native Gemini terminal answered a later prompt and returned to
    `ready` without a new Responses API error.
- Billing reservation:
  - 30 billing and terminal tests passed with 139 assertions.
  - Full native Gemini CLI request returned `BILLING_OK` while the account was
    at `12/15` burst usage.

## Production And Cleanup

- Railway deployment:
  `7eab0d9f-812a-4796-9d31-bcf64c58450e`
- Deployment status: `SUCCESS`.
- The live diagnostic settled at three credits, proving exact-use accounting.
- That diagnostic ledger/reservation was then precisely reversed.
- Final restored account state:
  - credits: `24`
  - burst: `12/15`
  - weekly: `26/50`
- Desktop bridge was left running against
  `https://vibyra-production.up.railway.app`.

## Diagnostic Order

For future Gemini terminal failures:

1. Read `/desktop/state.appApiUrl` and verify every proxy targets it.
2. Inspect the authoritative terminal transcript and worker configuration.
3. Separate auth failure, request translation failure, and billing denial.
4. Reproduce with the installed native CLI and terminal-scoped gateway token.
5. Verify first-turn, second-turn, tool-history, and quota behavior separately.
6. Deploy backend changes before claiming a production billing issue is fixed.
