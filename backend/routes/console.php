<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('vibyra:refresh-credits')->dailyAt('00:05')->withoutOverlapping();
Schedule::command('maxmind:update')->weekly()->withoutOverlapping();
