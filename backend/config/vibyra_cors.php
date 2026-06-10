<?php

$environment = (string) env('APP_ENV', 'production');
$developmentDefault = in_array($environment, ['local', 'testing'], true);
$allowedOrigins = array_values(array_unique(array_filter(array_map(
    static fn (string $origin): string => trim($origin),
    explode(',', (string) env('VIBYRA_CORS_ALLOWED_ORIGINS', ''))
))));

return [
    'allow_any_origin' => (bool) env('VIBYRA_CORS_ALLOW_ANY_ORIGIN', $developmentDefault),
    'allowed_origins' => $allowedOrigins,
];
