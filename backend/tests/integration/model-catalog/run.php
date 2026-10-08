<?php

require __DIR__.'/../../../vendor/autoload.php';
$app = require __DIR__.'/../../../bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (config('database.default') !== 'pgsql' || config('database.connections.pgsql.host') !== '127.0.0.1'
    || config('database.connections.pgsql.database') !== 'vibyra_model_catalog_qa') throw new RuntimeException('Disposable database required.');
$migration = require __DIR__.'/../../../database/migrations/2026_10_08_190000_create_model_catalog_tables.php';
$migration->up();
$pair = sodium_crypto_sign_keypair();
putenv('CATALOG_TEST_SIGNING_KEY='.bin2hex(sodium_crypto_sign_secretkey($pair)));
\Illuminate\Support\Facades\DB::table('model_catalog_models')->insert([
    'id' => 'openai/gpt-99', 'fingerprint' => str_repeat('a', 64), 'metadata' => json_encode(['id' => 'openai/gpt-99']),
    'seen_at' => now(), 'verified_at' => now(), 'status' => 'eligible',
]);
function race(string $kind): array {
    $children = [];
    for ($i = 0; $i < 8; $i++) {
        $process = proc_open([PHP_BINARY, __DIR__.'/worker.php', $kind, (string) $i], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $children[] = [$process, $pipes];
    }
    $results = [];
    foreach ($children as [$process, $pipes]) {
        $results[] = trim(stream_get_contents($pipes[1]));
        $error = stream_get_contents($pipes[2]);
        fclose($pipes[1]); fclose($pipes[2]);
        if (proc_close($process) !== 0) throw new RuntimeException($error);
    }
    return $results;
}
$budgets = race('budget');
if (count(array_filter($budgets, fn ($s) => $s !== 'capped')) !== 1) throw new RuntimeException('Budget oversubscribed.');
$revisions = race('publish');
if (count(array_unique($revisions)) !== 1 || \Illuminate\Support\Facades\DB::table('model_catalog_revisions')->count() !== 1) {
    throw new RuntimeException('Duplicate publication.');
}
echo "PASS: eight real PostgreSQL workers reserve one bounded spend and publish one revision.\n";
