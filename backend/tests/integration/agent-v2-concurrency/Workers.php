<?php
use App\Models\{User, VibyraSession};
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

/** Real `php artisan queue:work --queue=vibes,decisions,notifications --tries=1` processes, plus the data they consume. */
final class ConcWorkers
{
    private array $procs = [];
    private string $dir;

    public function __construct() { $this->dir = sys_get_temp_dir().'/conc-workers-'.bin2hex(random_bytes(3)); mkdir($this->dir); }

    public function __destruct()
    {
        array_map('unlink', glob($this->dir.'/*') ?: []);
        @rmdir($this->dir);
    }

    /** @return int pid */
    public function start(array $env = []): int
    {
        $i = count($this->procs);
        $p = proc_open([PHP_BINARY, __DIR__.'/artisan.php', 'queue:work', '--queue=vibes,decisions,notifications', '--tries=1', '--sleep=1', '--timeout=90'],
            [1 => ['file', $this->dir.'/w'.$i.'.log', 'w'], 2 => ['file', $this->dir.'/w'.$i.'.err', 'w']], $pipes, null, [...getenv(), ...$env]);
        $pid = proc_get_status($p)['pid'];
        $this->procs[$pid] = $p;
        return $pid;
    }

    public function alive(): array { return array_keys(array_filter($this->procs, fn ($p) => proc_get_status($p)['running'])); }

    public function stopAll(): void
    {
        foreach ($this->alive() as $pid) posix_kill($pid, SIGTERM);
        $until = microtime(true) + 12;
        while ($this->alive() && microtime(true) < $until) usleep(100000);
        foreach ($this->alive() as $pid) posix_kill($pid, SIGKILL);
        foreach ($this->procs as $p) proc_close($p);
        $this->procs = [];
    }

    public function stderr(): string { return implode("\n", array_map(fn ($f) => trim((string) file_get_contents($f)), glob($this->dir.'/*.err'))); }

    public static function drain(int $timeout = 90): bool
    {
        $until = microtime(true) + $timeout;
        while (microtime(true) < $until) {
            if (DB::table('jobs')->count() === 0) return true;
            usleep(200000);
        }
        return false;
    }

    /** Wait for a harness provider call that has started and not finished; returns its row. */
    public static function awaitInFlight(string $kind, ?string $key = null, int $timeout = 30): ?object
    {
        $until = microtime(true) + $timeout;
        while (microtime(true) < $until) {
            $row = DB::table('conc_calls')->where('kind', $kind)->when($key, fn ($q) => $q->where('ckey', $key))->whereNull('ended_at')->first();
            if ($row) return $row;
            usleep(50000);
        }
        return null;
    }

    /** A Vibyra-funded turn, reserved and queued exactly as a send would leave it. @return array{0: int, 1: string, 2: string} user, turn id, marker */
    public static function turn(bool $stall = false, bool $dispatch = true): array
    {
        config(['membership.free_enabled' => false, 'vibes.enabled' => true, 'vibes.daily_micro_usd_limit' => 100000000000]);
        $u = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 20]);
        app(\App\Services\Vibes\Wallet::class)->ensure($u, 0);
        app(\App\Services\Membership\Enrollment::class)->migrate($u, 20);
        DB::table('vibes_wallets')->where('user_id', $u->id)->update(['consented_at' => now()]);
        $chat = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $u->id, 'title' => 'Queue QA', 'created_at' => now(), 'updated_at' => now()]);
        $id = (string) Str::uuid();
        $marker = 'CONC_TURN_'.$id;
        $text = ($stall ? 'CONC_STALL ' : '').$marker;
        app(\App\Services\Vibes\Turns::class)->submit($u->id, $id, ['unitScale' => 10000, 'chatId' => $chat, 'model' => 'test', 'text' => $text,
            'request' => ['model' => 'test', 'messages' => [['role' => 'user', 'content' => $text]], 'max_tokens' => 256,
                'provider' => ['max_price' => ['prompt' => 1, 'completion' => 1]]],
            'expires' => now()->addMinutes(10)->timestamp, 'revision' => 0, 'trial' => true, 'max' => 100000]);
        if ($dispatch) \App\Jobs\RunVibesTurn::dispatch($id);
        return [$u->id, $id, $marker];
    }

    /** A teammate run that completes (run.completed → inbox item + push outbox row) for an account with one eligible phone. */
    public static function completedRun(): array
    {
        $fx = ConcFixture::make(false);
        $session = VibyraSession::create(['user_id' => $fx['user'], 'token_hash' => hash('sha256', 'phone-'.$fx['user']), 'device_name' => 'iPhone',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDays(2)]);
        DB::table('notification_devices')->insert(['id' => (string) Str::uuid(), 'user_id' => $fx['user'], 'session_id' => $session->id, 'installation' => (string) Str::uuid(),
            'proof_hash' => hash('sha256', 'p'), 'token' => Crypt::encryptString('ExpoPushToken[conc-'.$fx['user'].']'), 'token_hash' => hash_hmac('sha256', 'conc-'.$fx['user'], config('app.key')),
            'generation' => 1, 'environment' => 'development', 'created_at' => now(), 'updated_at' => now()]);
        ConcFixture::admit($fx, 'Finish quickly.');
        $c = ConcFixture::claim($fx);
        ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/complete', ['generation' => $c['generation'], 'answer' => 'Done.']), 200);
        $item = DB::table('notification_items')->where('user_id', $fx['user'])->value('id');
        return [$fx, $c['id'], DB::table('notification_deliveries')->where('item_id', $item)->value('id'), $item];
    }
}
