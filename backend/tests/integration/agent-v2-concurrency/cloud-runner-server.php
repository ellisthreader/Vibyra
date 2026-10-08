<?php
/** Real HTTP app; fixture safety is enforced before any route dispatch. */
use Illuminate\Http\Request;
define('LARAVEL_START', microtime(true));
require __DIR__.'/boot.php';
require __DIR__.'/CloudAgentOps.php';
$app = require_once __DIR__.'/../../../bootstrap/app.php';
$app->booted(function () { conc_guard(); ConcFakes::install(); ConcCloudAgentOps::configure(); });
$app->handleRequest(Request::capture());
