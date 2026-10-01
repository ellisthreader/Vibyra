<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('vibyra:refresh-credits')->dailyAt('00:05')->withoutOverlapping(120)->onOneServer();
Schedule::command('vibyra:sync-openrouter-pricing')->hourly()->withoutOverlapping(55)->onOneServer();
Schedule::command('vibyra:sync-openrouter-model-releases')->everyFiveMinutes()->withoutOverlapping(4)->onOneServer();
Schedule::command('vibyra:recover-chat-cost-reservations')->everyFiveMinutes()->withoutOverlapping(4)->onOneServer();
Schedule::command('maxmind:update')->weekly()->withoutOverlapping(120)->onOneServer();
Schedule::command('vibyra:deploy-runtime-demos --limit=1')->everyMinute()->withoutOverlapping(30)->onOneServer();
Schedule::command('vibyra:cleanup-runtime-demos --limit=5')->everyMinute()->withoutOverlapping(10)->onOneServer();

Schedule::command('vibyra:observe-work')->everyMinute()->withoutOverlapping(2)->onOneServer();

Schedule::command('vibyra:recover-vibes')->everyMinute()->withoutOverlapping(5)->onOneServer();

Schedule::command('vibyra:reconcile-vibes-purchases')->hourly()->withoutOverlapping(55)->onOneServer();
Schedule::command('vibyra:rollup-analytics')->dailyAt('02:00')->withoutOverlapping(30)->onOneServer();
Schedule::command('vibyra:prune-analytics')->dailyAt('02:15')->withoutOverlapping(30)->onOneServer();

Schedule::call(function () {
    \Illuminate\Support\Facades\DB::table('vibes_wallets')->where('billing_version', 2)->orderBy('user_id')
        ->chunk(200, function ($wallets) {
            foreach ($wallets as $w) app(\App\Services\Membership\Allowances::class)->refresh($w->user_id);
        });
})->hourly()->name('membership-allowances')->withoutOverlapping();

Schedule::command('vibyra:membership-remote-leases')->everyMinute()->withoutOverlapping();

Schedule::command('vibyra:membership-replay')->everyTenMinutes()
    ->when(fn () => filled(config('services.stripe.secret')))->withoutOverlapping()->onOneServer();
Schedule::command('vibyra:remote-revocations')->everyMinute()->withoutOverlapping();
Schedule::command('vibyra:security-notifications')->everyMinute()->withoutOverlapping()->onOneServer();
// A run killed mid-way (e.g. by a deploy) must not hold the overlap lock for the default 24 h: computers would stay "stopping".
Schedule::command('vibyra:cloud-workspaces')->everyTenSeconds()->withoutOverlapping(2)->onOneServer();
Schedule::command('vibyra:cloud-provider-audit')->everyMinute()->when(fn () => config('cloud_workspaces.fly_token') && config('cloud_workspaces.fly_org'))->withoutOverlapping()->onOneServer();

Schedule::command('vibyra:agent-v2-routines')->everyMinute()->when(fn () => (bool) config('agents_v2.enabled'))->withoutOverlapping(5)->onOneServer();
// An approved write stranded `dispatching` by a dead process is closed as unknown (never re-sent) so the task can finish or be cancelled.
Schedule::command('vibyra:agent-v2-sweep-dispatching')->everyMinute()->when(fn () => (bool) config('agents_v2.enabled'))->withoutOverlapping(5)->onOneServer();
// F-04: old run journals and attachment files age out; orphaned rows left by a deleted account are swept (daily, any flag state).
Schedule::command('vibyra:agent-v2-retention')->dailyAt('03:30')->withoutOverlapping()->onOneServer();
