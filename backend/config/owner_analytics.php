<?php

return [
    // Empty by default: deploying the dashboard never grants owner access itself.
    'emails' => array_values(array_filter(array_map(
        static fn (string $email): string => strtolower(trim($email)),
        explode(',', (string) env('VIBYRA_OWNER_EMAILS', '')),
    ))),
    'retention_days' => min(90, max(30, (int) env('VIBYRA_ANALYTICS_RETENTION_DAYS', 90))),
    'ingestion_enabled' => (bool) env('VIBYRA_ANALYTICS_INGESTION_ENABLED', true),
    'production_snapshot_path' => storage_path('app/private/owner-analytics-production.json'),
];
