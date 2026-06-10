<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('vibyra:refresh-credits')->dailyAt('00:05')->withoutOverlapping();
Schedule::command('vibyra:sync-openrouter-pricing')->hourly()->withoutOverlapping();
Schedule::command('vibyra:recover-chat-cost-reservations')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('maxmind:update')->weekly()->withoutOverlapping();
Schedule::command('vibyra:deploy-runtime-demos --limit=1')->everyMinute()->withoutOverlapping();
Schedule::command('vibyra:cleanup-runtime-demos --limit=5')->everyMinute()->withoutOverlapping();
