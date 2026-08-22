---
title: RealEstate - 3D Property Upload and Publication Plan
date: 2026-07-11
tags:
  - realestate
  - gilbert-and-rose
  - 3d-tour
  - implementation
status: implemented
related:
  - "[[RealEstate - Customer Account and Dashboard Plan]]"
  - "[[RealEstate - Gilbert and Rose Page-by-Page Design Specification]]"
---

# RealEstate - 3D Property Upload and Publication Plan

This delivery makes 3D-tour readiness visible and gives agents a complete path from a supported
Gaussian-splat file to one verified public tour. It connects the operational workspace to the
public property journey documented in [[Gilbert and Rose - Property Data and Search]].

## Reviewed plan

- [x] Add factual model count, latest version and live-tour status to agent property summaries.
- [x] Clean the agent dashboard hierarchy and introduce 3D-readiness counters and badges.
- [x] Add signed direct upload for `.splat`, `.ksplat` and `.ply` with progress and clear states.
- [x] Keep uploaded versions private until an agent reviews and publishes them.
- [x] Ensure publication retires any previously live version for the same property.
- [x] Add factual public `hasTour` filtering, thumbnails, badges and tour actions.
- [x] Surface verified 3D properties on the customer dashboard.
- [x] Add validation, API contract, service and component tests.

## Page-by-page result

### Agent property library — `/dashboard`

- Calm branded heading and one primary **New property** action.
- Compact counts for all properties, properties with models and live tours.
- Each property card reports the number of versions, latest version and one of:
  **UPLOAD NEEDED**, **READY TO REVIEW**, or **TOUR LIVE**.

### Agent property control room — `/dashboard/properties/:id`

- Upload panel accepts supported model formats and explains the 2 GiB limit.
- The browser requests an opaque signed upload session and displays progress.
- The API verifies the stored asset before creating the next version.
- Latest-model preview, tour editor, publication and deletion actions stay together.
- Success and error messages explicitly state whether the property/tour is live or private.

### Customer account — `/account`

- The dashboard remains honest about favourites, alerts and viewing requests that are not built.
- A separate **Properties with 3D tours** section queries only published properties with a live
  model and includes loading, error, empty and populated states.

### Public property pages — `/properties` and `/properties/:slug`

- A 3D badge and **Explore 3D** action appear only when a published model exists.
- A tour thumbnail can act as the property image when no cover image is stored.
- A property without a live model clearly says its 3D tour is being prepared.

## Safety decisions

- Client filenames never become storage paths or executable input.
- Web code uses typed API-client contracts; it never accesses the database or storage directly.
- Organisation ownership checks remain on every operational model/property route.
- Public routes return published records only.
- Only one model version is marked live after either model-level or property-level publication.
- Reconstruction tools remain behind worker adapters; this workflow uploads an already-produced
  model and does not execute reconstruction commands from the browser.

## Production follow-up

- [ ] Configure production object storage and signed-upload CORS.
- [ ] Generate thumbnails through an allowlisted processing adapter.
- [ ] Soak-test near-limit files and document retry/resume behaviour.
- [ ] Replace the demo-agent identity with production organisation authentication.

Related: [[RealEstate - Customer Account and Dashboard Plan]] · [[RealEstate - Gilbert and Rose Page-by-Page Design Specification]] · [[Gilbert and Rose Website Research]]
