<?php
/* One racing process: boot, connect, signal ready, wait for the shared start time, run one op, print one result line. */
require __DIR__.'/boot.php';
require __DIR__.'/Http.php';
require __DIR__.'/Fixture.php';
require __DIR__.'/Ops.php';
[, $dir, $idx, $op, $json] = $argv;
$args = json_decode($json, true);
ob_start();
conc_boot(true);
Illuminate\Support\Facades\DB::select('select 1');
file_put_contents($dir.'/ready.'.$idx, '1');
while (!is_file($dir.'/go')) usleep(200);
$go = (float) file_get_contents($dir.'/go');
while (microtime(true) < $go) { /* spin: sub-millisecond release */ }
if (($args['jitterMs'] ?? 0) > 0) usleep(random_int(0, $args['jitterMs'] * 1000));
$t0 = microtime(true);
try { $result = ConcOps::run($op, $args); }
catch (Throwable $e) { $result = ['crash' => get_class($e).': '.$e->getMessage()]; }
ob_end_clean();
echo "\n@@RESULT@@".json_encode(['pid' => getmypid(), 'idx' => (int) $idx, 't0' => $t0, 't1' => microtime(true), 'result' => $result])."\n";
