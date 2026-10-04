<?php

return [
    'signing_seed' => env('VIBYRA_REMOTE_SIGNING_SEED'),
    'email_notifications' => (bool) env('VIBYRA_SECURITY_EMAIL_NOTIFICATIONS', true),
    'rp_id' => env('VIBYRA_PASSKEY_RP_ID', parse_url(env('APP_URL', 'http://localhost'), PHP_URL_HOST)),
    'origin' => rtrim(env('VIBYRA_PASSKEY_ORIGIN', env('APP_URL', 'http://localhost')), '/'),
    'strong_auth_seconds' => 300,
    'ceremony_seconds' => 300,
    // One Face ID per visit: dropped connections reconnect without asking while the visit was alive within the idle
    // window, up to the max since the confirmation (RemoteVisit).
    'visit_idle_seconds' => (int) env('VIBYRA_REMOTE_VISIT_IDLE_SECONDS', 1800),
    'visit_max_seconds' => (int) env('VIBYRA_REMOTE_VISIT_MAX_SECONDS', 28800),
    // A cloud-only account (no Mac) may create its first passkey from its pending cloud phone. Off until reviewed.
    'first_cloud_passkey' => (bool) env('VIBYRA_FIRST_CLOUD_PASSKEY', false),
    'first_cloud_passkey_session_seconds' => (int) env('VIBYRA_FIRST_CLOUD_PASSKEY_SESSION_SECONDS', 3600),
    'session_idle_seconds' => (int) env('VIBYRA_REMOTE_SESSION_IDLE_SECONDS', 1800),
];
