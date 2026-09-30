<?php
/*
 * Agent V2 concurrency harness bootstrap. It boots the real Laravel app but REFUSES to run unless the
 * database is a disposable local Postgres (127.0.0.1, non-default port, name starting vibyra_v2_conc).
 * Run via run.sh, which starts that cluster and exports the env (see README lines in run.php).
 */
require_once __DIR__.'/../../../vendor/autoload.php';
require_once __DIR__.'/Fakes.php';

function conc_guard(): void
{
    $c = Illuminate\Support\Facades\DB::connection();
    $ok = $c->getDriverName() === 'pgsql' && $c->getConfig('host') === '127.0.0.1' && (int) $c->getConfig('port') !== 5432
        && str_starts_with((string) $c->getDatabaseName(), 'vibyra_v2_conc') && !$c->getConfig('url');
    if (!$ok) { fwrite(STDERR, "Refusing to run: a disposable local Postgres named vibyra_v2_conc* is required.\n"); exit(3); }
}

function conc_boot(bool $fakes = true): Illuminate\Foundation\Application
{
    $app = require_once __DIR__.'/../../../bootstrap/app.php';
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    conc_guard();
    if ($fakes) ConcFakes::install();
    return $app;
}
