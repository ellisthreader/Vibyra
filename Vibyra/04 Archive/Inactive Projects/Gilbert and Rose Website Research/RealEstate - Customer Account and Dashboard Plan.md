---
title: RealEstate - Customer Account and Dashboard Plan
date: 2026-07-11
tags:
  - project/real-estate
  - customer-account
  - authentication
  - dashboard
status: foundation-implemented
related:
  - "[[RealEstate - Gilbert and Rose Page-by-Page Design Specification]]"
  - "[[Gilbert and Rose Website Research]]"
repository: /home/ellis/Desktop/RealEstate
---

# RealEstate - Customer Account and Dashboard Plan

> [!success] Authentication foundation implemented
> Customers can now register, log in, open the protected `/account` dashboard and log out. Customer identities remain completely separate from organisation agents using `/dashboard`.

## Implemented

- [x] Screenshot-aligned split-panel login page
- [x] Screenshot-aligned two-column registration page
- [x] Responsive mobile form ordering and layouts
- [x] First name, last name, email, telephone, password and privacy-consent validation
- [x] Password visibility and live strength feedback
- [x] Salted scrypt password hashes
- [x] Opaque database-backed customer sessions
- [x] HTTP-only SameSite session cookie
- [x] Protected `/account` route and automatic login redirect
- [x] Branded customer dashboard with factual account data
- [x] Honest empty states for saved homes, alerts and viewing requests
- [x] Logout invalidation and expired-session handling
- [x] Unit, API integration and Playwright coverage

## Dashboard structure

1. Customer header with Browse Homes and Sign Out.
2. Personal welcome panel and primary property-search action.
3. Saved property, alert and viewing summary cards.
4. Saved-home collection with an accessible empty state.
5. Account profile using only stored customer data.
6. Direct contact route and compact legal footer.

## Next phases

### Saved properties

- [ ] Add a customer-to-published-property join table.
- [ ] Add typed save, remove and list endpoints.
- [ ] Add optimistic favourite controls with recoverable errors.
- [ ] Render saved published-property cards on the dashboard.

### Property alerts

- [ ] Store validated alert criteria and notification consent.
- [ ] Add pause, frequency and unsubscribe controls.
- [ ] Connect verified email delivery and failure handling.

### Viewing requests

- [ ] Add preferred-time and contact-consent fields.
- [ ] Add request status and customer cancellation.
- [ ] Add agent follow-up without exposing organisation tools.

### Account security

- [ ] Add single-use password-reset tokens and verified email delivery.
- [ ] Add password change and session/device management.
- [ ] Add email/telephone verification.
- [ ] Add account export and deletion workflows.

> [!warning] Honest product state
> The current dashboard displays zeros and clear “being connected” copy for saved properties, alerts and viewing requests. Those numbers must remain factual until their database models and APIs are implemented.

## Verification

- 32 web tests passed.
- 10 validation tests passed.
- 6 API-client tests passed.
- 5 focused API service/controller tests passed.
- 3 live PostgreSQL customer-auth integration tests passed.
- 8 Playwright public/customer journey tests passed.
- Desktop login, registration and dashboard screenshots reviewed.
- Mobile login screenshot reviewed at 390 × 844.
