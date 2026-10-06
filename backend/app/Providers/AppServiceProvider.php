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
        // Outbound account links must never inherit a caller-controlled Host or forwarded host.
        if ($this->app->environment('production')) {
            \Illuminate\Support\Facades\URL::forceRootUrl(rtrim((string) config('app.url'), '/'));
            \Illuminate\Support\Facades\URL::forceScheme('https');
        }

        \Illuminate\Support\Facades\RateLimiter::for('cloud-runtime', fn (\Illuminate\Http\Request $request) => [
            \Illuminate\Cache\RateLimiting\Limit::perMinute(240)->by('workspace:'.$request->route('workspace').':'.hash('sha256', (string) $request->bearerToken())),
            \Illuminate\Cache\RateLimiting\Limit::perMinute(3000)->by('ip:'.$request->ip()),
        ]);
        // Cloud sync, account side (the Mac). Defined here, not in routes/cloud_computer.php: production caches its routes,
        // and code in a cached route file never runs, so the limiter was missing and every Mac sync read answered 500.
        \Illuminate\Support\Facades\RateLimiter::for('cloud-sync', fn (\Illuminate\Http\Request $request) =>
            \Illuminate\Cache\RateLimiting\Limit::perMinute(240)->by('cloud-sync:'.hash('sha256', (string) $request->bearerToken())));
        // A GitHub token is minted here: bucket by the workspace and its bearer, not by a shared (NAT/relay) IP.
        \Illuminate\Support\Facades\RateLimiter::for('cloud-git-credential', fn (\Illuminate\Http\Request $request) => [
            \Illuminate\Cache\RateLimiting\Limit::perMinute(30)->by('git-cred:'.$request->route('workspace').':'.hash('sha256', (string) $request->bearerToken())),
            \Illuminate\Cache\RateLimiting\Limit::perMinute(600)->by('git-cred-ip:'.$request->ip()),
        ]);
    }
}
