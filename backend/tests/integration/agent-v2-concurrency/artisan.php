<?php
/*
 * `php artisan` with the harness's outbound-HTTP fakes installed. Used to start `queue:work` and the
 * routines command as real OS processes without any call leaving the machine. The command, its
 * options and every line of app code are exactly what `php artisan` runs.
 */
use Symfony\Component\Console\Input\ArgvInput;

define('LARAVEL_START', microtime(true));
require __DIR__.'/boot.php';
$app = require_once __DIR__.'/../../../bootstrap/app.php';
$app->booted(function () { conc_guard(); ConcFakes::install(); });
exit($app->handleCommand(new ArgvInput));
