<?php

return [
    'github_app' => [
        'app_id' => env('CLOUD_GITHUB_APP_ID'),
        'private_key' => env('CLOUD_GITHUB_APP_PRIVATE_KEY'),
        // Requires GitHub-side rules verified for every eligible repository.
        'push_enabled' => (bool) env('CLOUD_GITHUB_APP_PUSH_ENABLED', false),
    ],
    'enabled' => env('CLOUD_WORKSPACES_ENABLED', false),
    'ui_enabled' => env('CLOUD_WORKSPACES_UI_ENABLED', false),
    'starts_enabled' => env('CLOUD_WORKSPACES_STARTS_ENABLED', false),
    'ai_enabled' => env('CLOUD_WORKSPACES_AI_ENABLED', false),
    'preview_enabled' => env('CLOUD_WORKSPACES_PREVIEW_ENABLED', false),
    'preview_domain' => env('CLOUD_WORKSPACES_PREVIEW_DOMAIN'),
    'pilot_users' => array_filter(explode(',', (string) env('CLOUD_WORKSPACES_PILOT_USERS', ''))),
    'tariff_version' => env('CLOUD_WORKSPACES_TARIFF_VERSION'),
    // Exact existing wallet units per hour; zero/unset refuses quotes and starts.
    'units_per_hour' => (int) env('CLOUD_WORKSPACES_UNITS_PER_HOUR', 0),
    'provider_micro_per_hour' => (int) env('CLOUD_WORKSPACES_PROVIDER_MICRO_PER_HOUR', 0),
    // What happens once the included monthly hours are used: tokens (default) or blocked. Only matters when hours are set.
    'overage' => in_array(env('CLOUD_OVERAGE', 'tokens'), ['tokens', 'blocked'], true) ? env('CLOUD_OVERAGE', 'tokens') : 'tokens',
    'region' => env('CLOUD_WORKSPACES_REGION', 'lhr'),
    'image' => env('CLOUD_WORKSPACES_IMAGE'),
    'api_origin' => env('CLOUD_WORKSPACES_API_ORIGIN', env('APP_URL')),
    'fly_token' => env('CLOUD_WORKSPACES_FLY_TOKEN'),
    'fly_org' => env('CLOUD_WORKSPACES_FLY_ORG'),
    'provider_audit_required' => env('CLOUD_WORKSPACES_PROVIDER_AUDIT_REQUIRED', true),
    'lease_private_key' => env('CLOUD_WORKSPACES_LEASE_PRIVATE_KEY'),
    'fly_url' => 'https://api.machines.dev/v1',
    'disk' => env('CLOUD_WORKSPACES_DISK', 'cloud-workspaces'),
    'volume_gib' => 20,
    'max_workspaces' => 3,
    'global_running_limit' => (int) env('CLOUD_WORKSPACES_GLOBAL_RUNNING_LIMIT', 10),
    'starts_per_account_hour' => (int) env('CLOUD_WORKSPACES_STARTS_PER_ACCOUNT_HOUR', 20),
    'starts_per_account_day' => (int) env('CLOUD_WORKSPACES_STARTS_PER_ACCOUNT_DAY', 60),
    'starts_per_global_day' => (int) env('CLOUD_WORKSPACES_STARTS_PER_GLOBAL_DAY', 200),
    'daily_micro_limit' => (int) env('CLOUD_WORKSPACES_DAILY_MICRO_LIMIT', 0),
    // Operator-wide ceilings. Monthly defaults to 31 days of the daily limit.
    'monthly_micro_limit' => (int) env('CLOUD_WORKSPACES_MONTHLY_MICRO_LIMIT', 0),
    'soft_stop_percent' => (int) env('CLOUD_WORKSPACES_SOFT_STOP_PERCENT', 90),
    'warn_percent' => (int) env('CLOUD_WORKSPACES_WARN_PERCENT', 80),
    'max_retained_global' => (int) env('CLOUD_WORKSPACES_MAX_RETAINED_GLOBAL', 200),
    'account_daily_units' => (int) env('CLOUD_WORKSPACES_ACCOUNT_DAILY_UNITS', 3000000),
    'account_monthly_units' => (int) env('CLOUD_WORKSPACES_ACCOUNT_MONTHLY_UNITS', 30000000),
    'max_budget_units' => 10000000,
    'ai_turn_max_units' => (int) env('CLOUD_WORKSPACES_AI_TURN_MAX_UNITS', 50000),
    'lease_seconds' => 30,
    'runway_seconds' => 90,
    'idle_seconds' => 300,
    'max_background_seconds' => 28800,
    'boot_timeout_seconds' => 180,
    // A booted cloud computer whose Host never shows up on the relay is stopped with an error after this long.
    'computer_connect_seconds' => (int) env('CLOUD_COMPUTER_CONNECT_SECONDS', 150),
    'stop_timeout_seconds' => 45,
    'stopped_days' => 7,
    // A stopped cloud computer's Fly volume is deleted after this many days (min 7); a warning goes out 3 days before.
    'computer_stopped_days' => max(7, (int) env('CLOUD_COMPUTER_STOPPED_DAYS', 30)),
    // Signup Terms versions (config/legal.php) whose text covers cloud computer storage and retention. An account that
    // accepted one of these is not asked again at its first wake. Empty (default) keeps the first-wake consent.
    // The phone's "Connect to cloud" consent text version. Raising it asks every account to agree again before anything cloud happens.
    // 2 (2026-10-03): the phone wording also covers conversations, 30-day disk retention and hours/tokens.
    // 3 (2026-10-04): "only the projects you pick" are kept in Vibyra Cloud (docs/cloud-access-contract.md).
    'connect_consent_version' => (int) env('CLOUD_CONNECT_CONSENT_VERSION', 3),
    // "Connect to cloud" needs a Face ID proof from a key registered at sign-in (FaceKeys).
    'connect_requires_face' => (bool) env('CLOUD_CONNECT_REQUIRES_FACE', true),
    // The Mac may agree for the account with its own computer-key proof instead (MacConnectController). Off until reviewed.
    'mac_connect_enabled' => (bool) env('CLOUD_MAC_CONNECT_ENABLED', false),
    'computer_terms_versions' => array_filter(array_map('trim', explode(',', (string) env('CLOUD_COMPUTER_TERMS_VERSIONS', '')))),
    'archive_days' => 30,
    'checkpoint_history' => 5,
    'max_file_bytes' => 1048576,
    'max_project_bytes' => 20971520,
    'max_files' => 2000,
    // Cloud sync (docs/cloud-sync-contract.md): sealed project bundles. A local disk by default; point CLOUD_SYNC_DISK_ROOT at a mounted volume.
    'sync_disk' => env('CLOUD_SYNC_DISK', 'cloud-sync'),
    'sync_max_blob_bytes' => (int) env('CLOUD_SYNC_MAX_BLOB_BYTES', 536870912),
    // Resumable uploads keep their in-progress pieces here (default: the system temp dir).
    'sync_parts_dir' => env('CLOUD_SYNC_PARTS_DIR'),
    'sync_quota_bytes' => (int) env('CLOUD_SYNC_QUOTA_BYTES', 5368709120),
    'queue_connection' => env('CLOUD_WORKSPACES_QUEUE_CONNECTION', 'database'),
];
