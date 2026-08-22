<?php

return [
    'queue_enabled' => env('VIBYRA_RUNTIME_QUEUE_ENABLED', false),
    'queue' => env('VIBYRA_RUNTIME_QUEUE', 'deployments'),
    'job_timeout' => 1200,
];
