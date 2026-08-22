<?php

return [
    'mode' => env('VIBYRA_DEPLOYMENT_ARTIFACT_MODE', 'database'),
    'disk' => env('VIBYRA_DEPLOYMENT_ARTIFACT_DISK', 's3'),
    'prefix' => trim(env('VIBYRA_DEPLOYMENT_ARTIFACT_PREFIX', 'deployment-artifacts'), '/'),
];
