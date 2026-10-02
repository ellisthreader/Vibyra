<?php
require __DIR__.'/../../../vendor/autoload.php';
$app = require __DIR__.'/../../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use App\Services\Assistant\Budget;
use App\Services\Membership\Enrollment;
use App\Services\Vibes\{Wallet, Turns};
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;

if (DB::connection()->getConfig('host') !== '127.0.0.1' || DB::connection()->getDriverName() !== 'pgsql'
    || DB::connection()->getDatabaseName() !== 'vibyra_assistant_qa') throw new Exception('Disposable assistant QA database required');
config(['assistant.enabled' => true, 'assistant.month_micro_usd' => 1000000, 'assistant.user_concurrent_calls' => 20,
    'membership.free_enabled' => false, 'membership.enabled' => false, 'vibes.daily_micro_usd_limit' => 100000000]);
Http::preventStrayRequests();
function check(bool $ok, string $message): void { if (!$ok) throw new Exception($message); echo "PASS: $message\n"; }
function account(int $funds): User {
    $u = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
    app(Wallet::class)->ensure($u, 0); app(Enrollment::class)->migrate($u, 0);
    app(Wallet::class)->grant($u->id, 'assistant-qa:'.$u->id, 'topup', $funds); return $u;
}
function race(array $jobs): array {
    DB::disconnect(); $children = []; $files = []; $start = microtime(true) + 0.25;
    foreach ($jobs as $job) {
        $path = tempnam(sys_get_temp_dir(), 'assistant-race-'); $files[] = $path;
        $pid = pcntl_fork();
        if ($pid === 0) {
            DB::purge(); while (microtime(true) < $start) usleep(1000);
            try { $job(); $result = ['ok' => true]; }
            catch (Throwable $e) { $result = ['ok' => false, 'class' => get_class($e)]; }
            file_put_contents($path, json_encode($result)); exit(0);
        }
        $children[] = $pid;
    }
    foreach ($children as $pid) pcntl_waitpid($pid, $status);
    DB::purge(); $results = [];
    foreach ($files as $path) { $results[] = json_decode(file_get_contents($path), true); unlink($path); }
    return $results;
}
function successes(array $rows): int { return count(array_filter($rows, fn ($r) => $r['ok'] ?? false)); }
$u = account(10000); $request = (string) Str::uuid();
$r = race(array_fill(0, 4, fn () => app(Budget::class)->reserve($u->id, $request, 'chat', 5000)));
check(successes($r) === 1 && app(Wallet::class)->available($u->id) === 5000, 'four duplicate requests reserve exactly once');
$id = DB::table('assistant_requests')->where('user_id', $u->id)->value('id');
$r = race(array_fill(0, 4, fn () => app(Budget::class)->finish($id, 123)));
check(successes($r) === 4 && app(Wallet::class)->available($u->id) === 9877, 'simultaneous settlements debit fractional tokens once');
check(DB::table('vibes_ledger')->where('reference', 'assistant-settle:'.$id)->count() === 1, 'one immutable wallet settlement');
$a = account(10000); $b = account(10000);
config(['assistant.month_micro_usd' => 8123]);
$r = race([fn () => app(Budget::class)->reserve($a->id, (string) Str::uuid(), 'chat', 8000),
    fn () => app(Budget::class)->reserve($b->id, (string) Str::uuid(), 'chat', 8000)]);
check(successes($r) === 1, 'different accounts cannot overspend the global monthly cap');
config(['assistant.month_micro_usd' => 1000000]);
$c = account(10000); $chat = (string) Str::uuid();
DB::table('vibes_wallets')->where('user_id', $c->id)->update(['consented_at' => now()]);
DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $c->id, 'title' => 'QA', 'created_at' => now(), 'updated_at' => now()]);
$q = ['unitScale' => 10000, 'chatId' => $chat, 'model' => 'test', 'text' => 'Hi', 'request' => [],
    'expires' => now()->addMinute()->timestamp, 'revision' => 0, 'trial' => true, 'max' => 8000];
$r = race([fn () => app(Budget::class)->reserve($c->id, (string) Str::uuid(), 'chat', 8000),
    fn () => app(Turns::class)->submit($c->id, (string) Str::uuid(), $q)]);
check(successes($r) === 1 && app(Wallet::class)->available($c->id) === 2000, 'assistant and existing managed chat share one locked token balance');
$d = account(10000); $id = app(Budget::class)->reserve($d->id, (string) Str::uuid(), 'chat', 5000);
$r = race([fn () => app(Budget::class)->finish($id, 321), fn () => app(Budget::class)->finish($id, null)]);
check(successes($r) === 2 && in_array(app(Wallet::class)->available($d->id), [9679, 10000], true), 'recovery racing provider settlement cannot refund twice');
check(DB::table('vibes_ledger')->where('reference', 'assistant-settle:'.$id)->count() === 1, 'recovery has one settlement receipt');
check(DB::table('vibes_spend_days')->where('held', '<', 0)->count() === 0, 'shared provider holds never go negative');
