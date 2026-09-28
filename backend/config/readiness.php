<?php

return [
    'database' => [
        'enabled' => env('VIBYRA_READINESS_DATABASE', true),
        'connection' => env('VIBYRA_READINESS_DATABASE_CONNECTION'),
    ],
    'cache' => [
        'enabled' => env('VIBYRA_READINESS_CACHE', false),
        'store' => env('VIBYRA_READINESS_CACHE_STORE'),
    ],
    'storage' => [
        'enabled' => env('VIBYRA_READINESS_STORAGE', false),
        'disk' => env('VIBYRA_READINESS_STORAGE_DISK', env('FILESYSTEM_DISK', 'local')),
    ],
];
