# Railway monitoring preparation — read-only, 2026-10-01

No notification rule, provider, destination, payment or access was changed. No test message was sent.

## Existing-plan scope

Railway's [notification announcement](https://railway.com/changelog/2025-11-21-notifications) documents default high-severity build/deployment failures, crashes/OOM and volume storage alerts for every workspace, plus Email & In-App / Email Only / In-App Only / None controls. This is the available existing-account mechanism; a custom-rule-empty result does not prove defaults are disabled. Exact current preferences and delivery to the authenticated owner's mailbox remain unverified.

Recommended settings for owner review are Email & In-App for Vibyra project deployment failure, crashed/OOM deployments and provider volume-near-capacity warnings, retaining billing alerts. Scope the existing project, not unrelated workspaces/projects; the currently exposed create-rule input supports project scope and an ephemeral-environment Boolean, but does not expose environmentId or serviceId despite those fields appearing in output. Do not claim production-only/service-only enforcement from an invented input.

Custom CPU/RAM/disk/network threshold monitors [require Pro](https://docs.railway.com/observability#monitors), so no configurable 85%/95% disk monitor can be promised at no new cost on the current Hobby plan. Provider volume warning thresholds were not established and must not be invented. Existing startup health checks and restart policy are not continuous HTTP uptime checks. No existing no-cost native HTTP-response/latency/scheduler-failure alert contract was established. A project webhook would require an existing verified receiver; no such destination was supplied, so none was created.

## Exact read queries

```graphql
query {
  notificationRules(
    workspaceId: "f71cda0c-7d9e-4f49-9063-4b94b5438977"
    projectId: "4e292f83-b6e3-4556-a1db-69a39a2be3b2"
  ) {
    id projectId environmentId serviceId eventTypes severities
    channels { id config }
  }
  observabilityDashboards(
    environmentId: "8d678e46-a6f9-43a7-b192-3da614d82471", first: 25
  ) {
    edges { node { id items { dashboardItem { name type monitors { id } } } } }
  }
}
```

Workspace-wide rules were empty; production dashboards had no edges. The dashboard query is bounded to its first 25 entries; an empty first page establishes none, not a full audit of external systems.

```graphql
query {
  notificationDeliveries(first: 25, filter: {
    workspaceId: "f71cda0c-7d9e-4f49-9063-4b94b5438977"
    projectId: "4e292f83-b6e3-4556-a1db-69a39a2be3b2"
    type: EMAIL
  }) {
    edges { node {
      id type status createdAt
      notificationInstance { eventType severity status projectId environmentId serviceId volumeId }
    } }
    pageInfo { hasNextPage endCursor }
  }
}
```

This delivery query returned `Not Authorized`, trace 7895435955156704499. No messages were marked read. It is not evidence of zero sends or a delivery failure.

## Mutation boundary

The inspected schema exposes `notificationRuleCreate(input: CreateNotificationRuleInput!): NotificationRule!`. Required input fields are `workspaceId: String!`, `eventTypes: [String!]!`, `channelConfigs: [NotificationChannelConfig!]!`; optional fields are `projectId: String`, `ephemeralEnvironments: Boolean`, and `severities: [NotificationSeverity!]`. Severity values are CRITICAL, INFO, NOTICE, WARNING. NotificationChannelConfig is an opaque scalar without documented email structure or recipient fields. Event names are free strings rather than an enum. The official webhook example establishes `Deployment.failed`, but no complete verified event-name catalogue or email configuration contract was obtained. There is therefore no executable reviewed email mutation in this preparation; supplying one would guess security-relevant scope/recipient details.

Next safe step: inspect existing owner notification preferences with authorized account UI/access when available, using exact project/workspace IDs; retain documented defaults or save explicit Email & In-App preferences once their provider-supported fields are visible. Record saved configuration separately from actual delivery evidence, without triggering a business failure or sending an unrequested notification. Pro monitors remain deferred.
