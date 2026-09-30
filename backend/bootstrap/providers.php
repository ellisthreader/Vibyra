<?php

use App\Providers\AgentRunNotificationsServiceProvider;
use App\Providers\AppServiceProvider;
use App\Providers\AuthRateLimitServiceProvider;

return [
    AppServiceProvider::class,
    AuthRateLimitServiceProvider::class,
    AgentRunNotificationsServiceProvider::class,
];
