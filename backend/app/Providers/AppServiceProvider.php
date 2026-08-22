<?php

namespace App\Providers;

use App\Contracts\RuntimeDeploymentProvider;
use App\Services\Deployments\RailwayRuntimeDeploymentService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(RuntimeDeploymentProvider::class, RailwayRuntimeDeploymentService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
