<?php
use App\Services\AgentSchedules\Scheduler;
use Illuminate\Support\Facades\DB;

/** What a racing child can do. Nearly everything goes through the real HTTP kernel (routes, middleware, controllers). */
final class ConcOps
{
    public static function run(string $op, array $a): array
    {
        require_once __DIR__.'/CloudAgentOps.php';
        return match ($op) {
            'cloud_agent' => ConcCloudAgentOps::run($a),
            'call' => ConcHttp::call($a['method'], $a['uri'], $a['token'] ?? null, $a['json'] ?? [], $a['headers'] ?? [], $a['raw'] ?? null),
            'runner' => ConcHttp::runner($a['fx'], $a['method'], $a['suffix'], $a['json'] ?? []),
            'seq' => self::seq($a),
            'tick' => ['tick' => app(Scheduler::class)->tick()],
            'composio_store' => self::composioStore($a),
            'credential' => self::credential($a),
            'install_replace' => self::installReplace($a),
            'publish_job' => self::publishJob($a),
            'takeover_claim' => self::takeoverClaim($a),
            'sweep' => ['stats' => app(\App\Services\AgentRuns\Tools\DispatchSweeper::class)->sweep()],
            'claim_then_die' => self::claimThenDie($a),
            'poll' => self::poll($a),
            'revoke' => self::revoke($a),
            'notify' => self::notify($a),
            'takeover' => self::takeover($a),
            'old_runner' => self::oldRunner($a),
            'webhook_attempt' => (function () use ($a) { app(\App\Services\Platform\WebhookSender::class)->attempt($a['delivery']); return ['ran' => true]; })(),
            'webhook_emit' => (function () use ($a) { $run = \App\Models\AgentV2\Run::query()->findOrFail($a['run']); app(\App\Services\Platform\WebhookEvents::class)->emit($run, 'run.failed', $a['key']); return ['ran' => true]; })(),
            'key_create' => self::keyCreate($a),
            default => throw new InvalidArgumentException('Unknown op '.$op),
        };
    }

    /** Token bytes stay inside this worker; the race reports only the expected match/refusal. */
    private static function credential(array $a): array
    {
        try {
            $row = (new \App\Models\AgentV2\Connection)->setRawAttributes($a['snapshot'], true);
            $value = ($a['legacy'] ?? false)
                ? app(\App\Services\ChatConnectors\Installs::class)->credential($row->user_id, $row->provider)
                : app(\App\Services\AgentRuns\Connections\Credentials::class)->for($row);
            return ['matched' => hash_equals($a['expected'], $value)];
        } catch (\App\Services\AgentRuns\Tools\Providers\ToolFailure $e) { return ['refused' => $e->reason]; }
    }

    private static function installReplace(array $a): array
    {
        \App\Services\ChatConnectors\InstallStore::put(['user_id' => $a['user'], 'integration' => 'gmail'], [
            'account_label' => $a['identity'], 'credential' => \Illuminate\Support\Facades\Crypt::encryptString('replacement'),
            'connected_at' => $a['at'], 'updated_at' => now(), 'refresh_token' => null, 'expires_at' => null]);
        return ['reconnected' => true];
    }

    /** Part 11: creating a personal API key from many processes (the cap is a count taken under the user row lock). */
    private static function keyCreate(array $a): array
    {
        try { app(\App\Services\Platform\ApiKeys::class)->create($a['user'], 'conc '.$a['n'], ['runs:read']); return ['created' => true]; }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { return ['created' => false, 'code' => $e->getResponse()->getData(true)['code'] ?? null]; }
    }

    /** The insert-if-missing step of a finished Composio link (the OAuth flow binding in front of it is single-claim), called directly. */
    private static function composioStore(array $a): array
    {
        $accounts = app(\App\Services\AgentRuns\Composio\ComposioAccounts::class);
        $row = (new ReflectionMethod($accounts, 'store'))->invoke($accounts, $a['user'], 'airtable', $a['account'], ['data' => ['email' => $a['email']]]);
        return ['id' => $row->id, 'generation' => (int) $row->generation];
    }

    /** One delivery of the queued branch-publish job, run in this process (the queue worker runs exactly this). */
    private static function publishJob(array $a): array
    {
        app(\App\Services\AgentRuns\Computer\ComputerPublish::class)->run($a['action'], $a['upload']);
        return ['ran' => true];
    }

    /** A new runner taking a lapsed lease, then claiming one browser action under its new generation. */
    private static function takeoverClaim(array $a): array
    {
        $r = ConcHttp::runner($a['fx'], 'POST', '/claim');
        if ($r['status'] !== 200) return ['claimStatus' => $r['status'], 'action' => null];
        $run = $r['json']['run'];
        $c = ConcHttp::runner($a['fx'], 'POST', '/runs/'.$run['id'].'/'.($a['path'] ?? 'browser').'/'.$a['action'].'/claim', ['generation' => $run['generation'], 'fingerprint' => $a['fingerprint']] + ($a['claim'] ?? []));
        return ['claimStatus' => 200, 'generation' => $run['generation'], 'status' => $c['status'], 'state' => $c['json']['action']['state'] ?? null, 'claimed' => $c['json']['action']['claimedGeneration'] ?? null];
    }

    /** Sequential requests from one process (a runner streaming events, say). */
    private static function seq(array $a): array
    {
        $out = [];
        foreach ($a['reqs'] as $r) {
            $out[] = $r['kind'] === 'runner' ? ConcHttp::runner($r['fx'], $r['method'], $r['suffix'], $r['json'] ?? [])
                : ConcHttp::call($r['method'], $r['uri'], $r['token'] ?? null, $r['json'] ?? [], $r['headers'] ?? [], $r['raw'] ?? null);
            if (!empty($r['sleepMs'])) usleep($r['sleepMs'] * 1000);
        }
        return ['responses' => $out];
    }

    /** A scheduler that wins the occurrence claim and is killed before it admits anything. */
    private static function claimThenDie(array $a): array
    {
        $s = \App\Models\AgentV2\Schedule::query()->findOrFail($a['schedule']);
        $o = app(Scheduler::class)->claim($s, Carbon\CarbonImmutable::now());
        fwrite(STDERR, 'claimed '.($o ? $o->id : 'nothing')."\n");
        posix_kill(getmypid(), SIGKILL);
        return [];
    }

    /** The notification hook for one journal event, run again (as a retry or a second worker would). */
    private static function notify(array $a): array
    {
        app(\App\Services\Notifications\AgentRunNotifications::class)->record(\App\Models\AgentV2\RunEvent::query()->findOrFail($a['event']));
        return ['ok' => true];
    }

    /** Disconnect a connection, then stamp (DB clock) the moment the call returned to its caller. */
    private static function revoke(array $a): array
    {
        $r = ConcHttp::call('DELETE', '/api/agents/v2/connections/'.$a['connection'], $a['token']);
        DB::table('conc_calls')->insert(['kind' => 'REVOKE_DONE', 'ckey' => 'tok-'.$a['user'], 'pid' => getmypid()]);
        return $r;
    }

    /** A runner that keeps trying to claim until the lease it is waiting for expires, then streams output under its new generation. */
    private static function takeover(array $a): array
    {
        // Wait (cheaply, on the database) for the lease to be expired, then claim once, all racers at the same instant.
        $until = microtime(true) + 20; $run = null;
        while (microtime(true) < $until) {
            $exp = DB::table('agent_runs')->where('id', $a['run'])->value('lease_expires_at');
            if ($exp && Carbon\Carbon::parse($exp)->isPast()) break;
            usleep(1000);
        }
        $r = ConcHttp::runner($a['fx'], 'POST', '/claim');
        if ($r['status'] === 200) $run = $r['json']['run'];
        $posted = [];
        for ($i = 0; $run && $i < $a['events']; $i++) {
            $posted[] = ConcHttp::runner($a['fx'], 'POST', '/runs/'.$run['id'].'/events', ['generation' => $run['generation'],
                'events' => [['type' => 'message.delta', 'text' => 'g'.$run['generation'].'-'.$i]]])['status'];
        }
        return ['claimStatus' => $r['status'], 'generation' => $run['generation'] ?? null, 'posted' => $posted];
    }

    /** The runner that held generation 1: events, heartbeats and tool calls while somebody else takes its lease. */
    private static function oldRunner(array $a): array
    {
        $out = [];
        for ($n = 0; $n < $a['n']; $n++) {
            $base = '/runs/'.$a['run']['id'];
            if ($n % 6 === 5) $r = ConcFixture::toolCall($a['fx'], $a['run'], 'gmail_search', ['query' => 'from:x'], 'old-'.$n);
            elseif ($n % 4 === 3 && $n >= 60) $r = ConcHttp::runner($a['fx'], 'POST', $base.'/heartbeat', ['generation' => $a['run']['generation']]);
            else $r = ConcHttp::runner($a['fx'], 'POST', $base.'/events', ['generation' => $a['run']['generation'],
                'events' => [['type' => 'message.delta', 'text' => 'g1-'.$n]]]);
            $kind = $n % 6 === 5 ? 'tool' : ($n % 4 === 3 && $n >= 60 ? 'heartbeat' : 'event');
            $out[] = [$kind, $n, $r['status'], $r['json']['code'] ?? null];
            usleep(4000);
        }
        return ['calls' => $out];
    }

    /** A reader following a run's journal by cursor: it must see every seq exactly once and in order. */
    private static function poll(array $a): array
    {
        $cursor = 0; $seen = []; $until = microtime(true) + $a['seconds'];
        do {
            $r = ConcHttp::call('GET', '/api/agents/v2/runs/'.$a['run'].'/events', $a['token'], ['after' => $cursor, 'limit' => 200], ['X-Conc-Ip' => 'poll-'.getmypid()]);
            foreach (($r['json']['events'] ?? []) as $e) { $seen[] = $e['seq']; }
            $cursor = $r['json']['nextCursor'] ?? $cursor;
            usleep(30000);
        } while (microtime(true) < $until);
        $rows = DB::table('agent_run_events')->where('run_id', $a['run'])->count();
        return ['seen' => count($seen), 'contiguous' => $seen === range(1, count($seen)) || $seen === [], 'last' => $cursor, 'rowsAtEnd' => $rows];
    }

    private static function privacyAppend(array $a): array
    {
        $n = 0;
        try {
            foreach (range(1, $a['count']) as $i) {
                app(\App\Services\AgentRuns\Events::class)->append(\App\Models\AgentV2\Run::query()->findOrFail($a['runs'][$i % count($a['runs'])]), 'run.note', ['i' => $i]);
                $n++;
            }
        } catch (Throwable $e) { return ['appended' => $n, 'stopped' => class_basename($e)]; }
        return ['appended' => $n, 'stopped' => null];
    }

    private static function accountDelete(array $a): array
    {
        usleep((int) ($a['delayMs'] ?? 0) * 1000);
        return ['deleted' => app(\App\Services\Account\AccountDeletion::class)->delete(\App\Models\User::query()->findOrFail($a['user']))];
    }

}
