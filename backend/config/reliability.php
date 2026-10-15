<?php

/** Account archives stay off until their existing release flag is approved. */
return ['export' => [
    'enabled' => (bool) env('ACCOUNT_EXPORT_ENABLED', false),
    'disk' => env('ACCOUNT_EXPORT_DISK', 'local'),
    'interval_hours' => 24, 'link_minutes' => 15, 'keep_hours' => 24, 'max_rows' => 20000,
]];
