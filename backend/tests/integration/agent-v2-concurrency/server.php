<?php
/* Router script for `php -S`: public/index.php with the harness's outbound-HTTP fakes, so a real HTTP server can be raced safely. */
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));
require __DIR__.'/boot.php';
$app = require_once __DIR__.'/../../../bootstrap/app.php';
$app->booted(function () { conc_guard(); ConcFakes::install(); });
$app->handleRequest(Request::capture());
