---
title: HKE Memory
type: project-memory
project: HKE
status: active
updated: 2026-08-23
tags:
  - ai/memory
  - project/hke
---

# HKE Memory

> [!info] AI quick context
> Start here for Hong Kong Express work. Project home note: [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]].

## Read order (HKE tasks)

1. This file.
2. [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]] â€” project home, status, next actions.
3. One lesson note from [[01 Projects/Hong Kong Express/Lessons/Menu image assets must be synced to live DB|Lessons]] if the task touches that area.
4. [[01 Projects/Hong Kong Express/Reflection Notes|Reflection Notes]] â€” deep reference only; search with `rg`, do not read end-to-end.

## Recent routing reminder

HKE/Homegrounds work should use the HKE skills and project memory. Trigger words include checkout, cart, basket, order, till, payment, receipt, Electron startup, Homegrounds, Hong Kong Express, menu images, and visual QA. Do not mix HKE fixes into RelayClarity, Vibyra, ClearDBS, or Azure workspaces.

## Lessons

- [[01 Projects/Hong Kong Express/Lessons/Menu catalog must fall back to seed JSON when DB is empty|Menu catalog must fall back to seed JSON when DB is empty]]
- [[01 Projects/Hong Kong Express/Lessons/Menu image assets must be synced to live DB|Menu image assets must be synced to live DB]]
- [[01 Projects/Hong Kong Express/Lessons/HKE Image Serving Incident - 2026-07-02|HKE Image Serving Incident - 2026-07-02]]

## Incidents (in 01 Projects)

- [[01 Projects/Hong Kong Express/Incidents/HKE Checkout Incident - 2026-07-03|HKE Checkout Incident - 2026-07-03]]
- [[01 Projects/Hong Kong Express/Reviews/HKE Codex Chat Review - 2026-07-03|HKE Codex Chat Review - 2026-07-03]]

## Authentication recovery contract

- The current reset-password UI lives in `resources/js/Pages/Auth/ResetPassword.tsx` and `PasswordRecoveryShell.tsx`; it must not be replaced with the legacy website `Layout`.
- `NewPasswordController::create` authenticates the email and reset token before rendering the form. Invalid, expired, replaced, or already-used links render the branded unavailable state with HTTP 410.
- A reset link is consumed only after a successful password change. Do not consume it on page-open because email security scanners may prefetch links before the customer clicks them.
- Successful password reset deletes the broker token and revokes the customer's other web and API sessions through `CredentialSessionService`.
- Reset pages use `Cache-Control: no-store, private` and `Referrer-Policy: no-referrer`; link views and reset submissions are rate-limited.
