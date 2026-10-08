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
        $this->app->scoped(\App\Services\ModelCatalog\PublishedCatalog::class);
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
        // The cloud computer's phone/Mac routes, per account: `throttle:N,1,prefix` keyed by IP, so a phone and a Mac on one home
        // network (or strangers behind one carrier address) shared a bucket. A request with no bearer falls back to its IP.
        foreach (['cloud-computer-read' => 120, 'cloud-computer-create' => 6, 'cloud-computer-connect' => 6, 'cloud-computer-face-key' => 6,
            'cloud-computer-face-challenge' => 20, 'cloud-computer-wake' => 6, 'cloud-computer-repos' => 30, 'cloud-computer-projects' => 30,
            'cloud-access-projects' => 30, 'cloud-access-codex' => 30, 'cloud-access-accounts' => 30, 'cloud-sync-login' => 30, 'cloud-sync-repair' => 6] as $name => $perMinute) {
            \Illuminate\Support\Facades\RateLimiter::for($name, function (\Illuminate\Http\Request $request) use ($name, $perMinute) {
                $token = (string) $request->bearerToken();
                return \Illuminate\Cache\RateLimiting\Limit::perMinute($perMinute)->by($name.':'.($token !== '' ? hash('sha256', $token) : 'ip:'.$request->ip()));
            });
        }
        // A GitHub token is minted here: bucket by the workspace and its bearer, not by a shared (NAT/relay) IP.
        \Illuminate\Support\Facades\RateLimiter::for('cloud-git-credential', fn (\Illuminate\Http\Request $request) => [
            \Illuminate\Cache\RateLimiting\Limit::perMinute(30)->by('git-cred:'.$request->route('workspace').':'.hash('sha256', (string) $request->bearerToken())),
            \Illuminate\Cache\RateLimiting\Limit::perMinute(600)->by('git-cred-ip:'.$request->ip()),
        ]);
    }
}
