<?php
namespace App\Providers;

use App\Models\AgentV2\RunEvent;
use App\Services\LiveActivities\{ApnsJwt, Dispatcher};
use Illuminate\Support\ServiceProvider;

/**
 * Live Activity hook beside AgentRunNotificationsServiceProvider: a second listener on
 * the run journal, so AgentRuns/* stays untouched. Inert while LIVE_ACTIVITIES_ENABLED is off.
 */
final class LiveActivitiesServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // One provider token per process, so it is refreshed about every forty minutes, not per send.
        $this->app->singleton(ApnsJwt::class);
    }

    public function boot(): void
    {
        RunEvent::created(fn (RunEvent $event) => app(Dispatcher::class)->onRunEvent($event));
    }
}
