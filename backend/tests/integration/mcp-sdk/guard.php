<?php
require __DIR__.'/../../../vendor/autoload.php';
$app = require __DIR__.'/../../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = config('database.connections.sqlite.database');
// Run before migration: cached production configuration must never reach this test.
if (!$app->environment('testing') || config('database.default') !== 'sqlite'
    || !is_string($db) || $db !== getenv('DB_DATABASE')
    || !str_starts_with(basename(dirname($db)), 'vibyra-mcp-sdk-')
    || !is_file($db) || filesize($db) !== 0) {
    throw new RuntimeException('SDK acceptance requires an empty disposable SQLite database.');
}
