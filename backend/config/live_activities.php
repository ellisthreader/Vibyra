<?php

/*
 * iPhone Live Activities (Part 3 of the product roadmap). Off by default.
 *
 * Updates reach a Live Activity only through APNs (push type `liveactivity`), so this
 * is a second push path beside the Expo one. The APNs auth key (.p8) is supplied by the
 * owner through the hosting secret store (APNS_AUTH_KEY holds the PEM text, with
 * newlines as \n, or APNS_AUTH_KEY_PATH names a file on the host). It is never written
 * to the repository, a log or a response.
 */
return [
    'enabled' => (bool) env('LIVE_ACTIVITIES_ENABLED', false),
    // <bundle id>.push-type.liveactivity
    'topic' => env('LIVE_ACTIVITY_TOPIC', 'app.vibyra.mobile.push-type.liveactivity'),
    // The Swift ActivityAttributes type a push-to-start payload names.
    'attributes_type' => 'VibyraRunAttributes',
    'apns' => [
        'key_id' => env('APNS_KEY_ID'),
        'team_id' => env('APNS_TEAM_ID', '6WXKN5P8K5'),
        'key' => env('APNS_AUTH_KEY'),
        'key_path' => env('APNS_AUTH_KEY_PATH'),
        // Empty means: sandbox while PUSH_ENVIRONMENT is development, production otherwise.
        'base_url' => env('APNS_BASE_URL'),
        'timeout' => 10,
    ],
    // A finished card stays about this long; a failed one stays until the person has seen it.
    'finished_minutes' => 15,
    // After this long without a push the card shows "No recent update" (needs-a-person
    // states use the approval window, which is 15 minutes).
    'stale_minutes' => 45,
    'person_stale_minutes' => 15,
    // Bursts of transitions collapse into one push carrying the latest state.
    'coalesce_seconds' => 2,
    // The phone limits itself to this many cards; the server stops pushing starts past it.
    'max_concurrent' => 2,
];
