<?php
/*
 * Driver: `php tests/integration/agent-v2-concurrency/run.php [--fresh] [scenario ...]`, normally through run.sh.
 * Scenarios: admission leases events approvals terminal connections schedules triggers sweeper stranded inserts publish browser queue wire.
 * Default: all but `queue` (kill -9 tests, ~1 min) and `wire` (php -S on :54391); run.sh `all` includes both.
 * Needs the disposable Postgres from run.sh; boot.php refuses any other database.
 */
require __DIR__.'/boot.php';
foreach (['Http', 'Fixture', 'Race', 'Check', 'Workers', 'Pg'] as $f) require __DIR__.'/'.$f.'.php';
foreach (glob(__DIR__.'/scenarios/*.php') as $f) require $f;

$app = conc_boot(true);
$names = array_values(array_filter(array_slice($argv, 1), fn ($a) => !str_starts_with($a, '--')));
if (in_array('--fresh', $argv, true)) Illuminate\Support\Facades\Artisan::call('migrate:fresh', ['--force' => true]);
ConcFakes::setup();
$all = ['admission' => ConcAdmission::class, 'leases' => ConcLeases::class, 'events' => ConcEvents::class,
    'approvals' => ConcApprovals::class, 'terminal' => ConcTerminal::class, 'schedules' => ConcSchedules::class, 'connections' => ConcConnections::class, 'triggers' => ConcTriggers::class, 'sweeper' => ConcSweeper::class, 'stranded' => ConcStranded::class, 'inserts' => ConcInserts::class, 'publish' => ConcPublish::class,
    'browser' => ConcBrowser::class, 'wire' => ConcWire::class, 'queue' => ConcQueue::class];
$names = $names ?: array_keys(array_diff_key($all, ['queue' => 1, 'wire' => 1]));
foreach ($names as $n) {
    $class = $all[$n] ?? null;
    if (!$class) { fwrite(STDERR, "Unknown scenario $n\n"); exit(2); }
    Illuminate\Support\Facades\DB::table('cache')->delete(); // fresh throttle windows per scenario
    try { $class::run(); } catch (Throwable $e) { Conc::check($n.' scenario completed', false, get_class($e).': '.$e->getMessage().' @'.basename($e->getFile()).':'.$e->getLine()); }
}
$fail = count(array_filter(Conc::$results, fn ($r) => !$r['pass']));
$stray = ConcFakes::count('STRAY');
Conc::$scenario = 'all';
Conc::check('no outbound request left the harness (STRAY calls)', $stray === 0, 'stray='.$stray);
file_put_contents(getenv('CONC_RESULTS') ?: sys_get_temp_dir().'/agent-v2-concurrency-results.json', json_encode(Conc::$results, JSON_PRETTY_PRINT));
echo "\n".count(Conc::$results).' checks, '.count(array_filter(Conc::$results, fn ($r) => !$r['pass']))." failed\n";
exit($fail ? 1 : 0);
