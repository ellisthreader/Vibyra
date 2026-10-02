<?php

return [
    'enabled' => (bool) env('OPS_ATTACHMENT_BACKUP_ENABLED', false),
    'key' => env('BACKUP_ENCRYPTION_KEY'),
    'disk' => [
        'driver' => 's3',
        'key' => env('BACKUP_S3_ACCESS_KEY'),
        'secret' => env('BACKUP_S3_SECRET_KEY'),
        'region' => env('BACKUP_S3_REGION', 'auto'),
        'bucket' => env('BACKUP_S3_BUCKET'),
        'endpoint' => env('BACKUP_S3_ENDPOINT'),
        'use_path_style_endpoint' => false,
        'visibility' => 'private',
        'throw' => true,
        'http' => ['connect_timeout' => 10, 'timeout' => 30],
    ],
];
