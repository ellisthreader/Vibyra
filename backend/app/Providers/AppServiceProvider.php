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
        $this->app->bind(\App\Services\CloudWorkspaces\CloudWorkspaceProvider::class, \App\Services\CloudWorkspaces\FlyProvider::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        \Illuminate\Support\Facades\RateLimiter::for('cloud-runtime', fn (\Illuminate\Http\Request $request) => [
            \Illuminate\Cache\RateLimiting\Limit::perMinute(240)->by('workspace:'.$request->route('workspace').':'.hash('sha256', (string) $request->bearerToken())),
            \Illuminate\Cache\RateLimiting\Limit::perMinute(3000)->by('ip:'.$request->ip()),
        ]);
        // A GitHub token is minted here: bucket by the workspace and its bearer, not by a shared (NAT/relay) IP.
        \Illuminate\Support\Facades\RateLimiter::for('cloud-git-credential', fn (\Illuminate\Http\Request $request) => [
            \Illuminate\Cache\RateLimiting\Limit::perMinute(30)->by('git-cred:'.$request->route('workspace').':'.hash('sha256', (string) $request->bearerToken())),
            \Illuminate\Cache\RateLimiting\Limit::perMinute(600)->by('git-cred-ip:'.$request->ip()),
        ]);
    }
}
