# Backend Team Planning

`POST /api/chat/team-plan` is the authenticated cloud specialization endpoint
for Vibyra Team assignments.

- `TeamPlanEndpoint.php` owns authentication, GPT-5.4 mini dispatch, the
  `team-plan` billing reservation, settlement, and the public response.
- `Services/AI/TeamAssignmentPlanner.php` bounds request context and builds the
  structured-output prompt.
- `Services/AI/TeamPlanSchema.php` is the stable facade for output-schema,
  topology, and proposal-normalization services.
- `TeamPlanOutputSchema`, `TeamPlanTopology`, `TeamPlanProposalNormalizer`,
  `TeamPlanAssignmentNormalizer`, `TeamPlanCriteriaNormalizer`,
  `TeamPlanScopeNormalizer`, and `TeamPlanValues` keep policy, normalization,
  and path security independently auditable.
- `StrictJsonDecoder` and `StrictJsonStringParser` reject duplicate keys,
  trailing content, invalid strings/UTF-8, excessive size, and excessive depth.

Callers must supply a deterministic supported topology. The model can
specialize objectives, deliverables, scope hints, validation intents, risks,
and acceptance criteria, but cannot choose roles, permissions, tools,
providers, prompts, credentials, or lifecycle policy. Only Builder may receive
write scope. Invalid provider output is billed when dispatched, rejected in
full, and must trigger deterministic fallback in the desktop bridge.

Focused validation:

```bash
cd backend
php artisan test tests/Unit/TeamPlanSchemaTest.php tests/Feature/VibyraTeamPlanApiTest.php
```
