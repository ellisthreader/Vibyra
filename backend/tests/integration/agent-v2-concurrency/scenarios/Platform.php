<?php
use Illuminate\Support\Facades\DB;

/**
 * Scenario 11 (roadmap Part 11): what the platform API admits by key or idempotency, raced from many real processes: a personal
 * key's per-minute budget, `api.invoke` intake (by Idempotency-Key, by the hourly cap, and through a key), the API key cap, one
 * webhook delivery per (endpoint, event), and one HTTP send per delivery however many workers claim it.
 */
final class ConcPlatform
{
    public static function run(): void
    {
        Conc::$scenario = '11 platform API';
        self::keyBudget();
        self::invokeBySecret();
        self::invokeByKey();
        self::keyCap();
        self::webhooks();
    }

    private static function makeKey(array $fx, array $scopes, ?int $rate = null): string
    {
        return app(\App\Services\Platform\ApiKeys::class)->create($fx['user'], 'conc', $scopes, $rate)[1];
    }

    private static function trigger(array $fx, array $extra = []): array
    {
        $r = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/triggers', $fx['token'], ['agentId' => $fx['agent'], 'kind' => 'api.invoke',
            'promptTemplate' => 'Handle this call.', ...$extra]), 201);
        return ['id' => $r['trigger']['id'], 'secret' => $r['webhook']['secret']];
    }

    private static function hit(array $t, string $idempotency, string $subject): array
    {
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/hooks/api/'.$t['id'], 'token' => $t['secret'], 'json' => ['text' => 'call '.$subject, 'subject' => $subject],
            'headers' => ['X-Conc-Ip' => 'api-'.$t['id'], 'Idempotency-Key' => $idempotency]];
    }

    private static function keyBudget(): void
    {
        $fx = ConcFixture::make(false);
        $secret = self::makeKey($fx, ['runs:read'], 5);
        $race = ConcRace::run(array_map(fn ($i) => ['op' => 'call', 'method' => 'GET', 'uri' => '/api/platform/v1/runs', 'token' => $secret,
            'headers' => ['X-Conc-Ip' => 'key-'.$i]], range(1, 20)));
        Conc::check('20 parallel requests on a key with a budget of 5 a minute (from 20 different addresses): exactly 5 answered, 15 refused rate_limited',
            Conc::tally($race) === ['200' => 5, '429:rate_limited' => 15], Conc::fmt(Conc::tally($race)));
    }

    private static function invokeBySecret(): void
    {
        $fx = ConcFixture::make(false);
        $t = self::trigger($fx);
        $race = ConcRace::run(array_fill(0, 20, self::hit($t, 'same-call-0001', 'order-1')));
        $events = DB::table('agent_trigger_events')->where('trigger_id', $t['id'])->count();
        $runs = DB::table('agent_runs')->where('user_id', $fx['user'])->count();
        $dup = count(array_filter($race, fn ($r) => ($r['result']['json']['duplicate'] ?? null) === true));
        Conc::check('20 parallel api.invoke calls with one Idempotency-Key: one event, one run, 19 duplicates, all 202',
            $events === 1 && $runs === 1 && $dup === 19 && Conc::tally($race) === ['202' => 20], 'events='.$events.' runs='.$runs.' dup='.$dup.' '.Conc::fmt(Conc::tally($race)));

        $capped = self::trigger($fx, ['ratePerHour' => 5]);
        $race = ConcRace::run(array_map(fn ($i) => self::hit($capped, 'distinct-call-'.$i.bin2hex(random_bytes(3)), 'order-'.$i), range(1, 20)));
        $by = DB::table('agent_trigger_events')->where('trigger_id', $capped['id'])->get()->groupBy('state')->map->count()->all();
        Conc::check('20 parallel DISTINCT api.invoke calls (distinct subjects) against ratePerHour=5: exactly 5 admitted, 15 skipped rate_limited',
            ($by['admitted'] ?? 0) === 5 && ($by['skipped'] ?? 0) === 15 && Conc::tally($race) === ['202' => 20], json_encode($by).' '.Conc::fmt(Conc::tally($race)));

        $busy = self::trigger($fx, ['ratePerHour' => 30]);
        ConcRace::run(array_map(fn ($i) => self::hit($busy, 'subject-call-'.$i.bin2hex(random_bytes(3)), 'one-order'), range(1, 20)));
        $by = DB::table('agent_trigger_events')->where('trigger_id', $busy['id'])->get()->groupBy('state')->map->count()->all();
        Conc::check('20 parallel DIFFERENT api.invoke calls about one subject: exactly 1 admitted, 19 skipped subject_busy',
            ($by['admitted'] ?? 0) === 1 && ($by['skipped'] ?? 0) === 19, json_encode($by));
    }

    private static function invokeByKey(): void
    {
        $fx = ConcFixture::make(false);
        $t = self::trigger($fx);
        $secret = self::makeKey($fx, ['triggers:invoke'], 600);
        $op = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/platform/v1/triggers/'.$t['id'].'/invoke', 'token' => $secret, 'json' => ['text' => 'from CI'],
            'headers' => ['X-Conc-Ip' => 'invoke-key', 'Idempotency-Key' => 'ci-call-conc-1']];
        $race = ConcRace::run(array_fill(0, 20, $op));
        Conc::check('20 parallel key-authenticated invokes with one Idempotency-Key: one run, all 202',
            DB::table('agent_runs')->where('user_id', $fx['user'])->count() === 1 && Conc::tally($race) === ['202' => 20], Conc::fmt(Conc::tally($race)));
    }

    private static function keyCap(): void
    {
        $fx = ConcFixture::make(false);
        $race = ConcRace::run(array_map(fn ($i) => ['op' => 'key_create', 'user' => $fx['user'], 'n' => $i], range(1, 15)));
        $made = count(array_filter($race, fn ($r) => ($r['result']['created'] ?? false) === true));
        $live = DB::table('api_keys')->where('user_id', $fx['user'])->whereNull('revoked_at')->count();
        Conc::check('15 parallel API key creations against the cap of 10: exactly 10 created, 5 refused key_limit', $made === 10 && $live === 10, 'made='.$made.' live='.$live);
    }

    private static function webhooks(): void
    {
        $fx = ConcFixture::make(false);
        $endpoint = app(\App\Services\Platform\WebhookEndpoints::class)->create($fx['user'], 'https://hooks.conc.example/vibyra', ['run.failed'])[0];
        $run = ConcFixture::admit($fx, 'Run for webhooks');
        $race = ConcRace::run(array_map(fn () => ['op' => 'webhook_emit', 'run' => $run['id'], 'key' => $run['id'].':run.failed'], range(1, 12)));
        $rows = DB::table('webhook_deliveries')->where('endpoint_id', $endpoint->id)->count();
        Conc::check('12 processes emitting the same run event at once: exactly one delivery row for the endpoint', $rows === 1 && count(array_filter($race, fn ($r) => isset($r['result']['ran']))) === 12,
            'rows='.$rows.' '.Conc::fmt(Conc::tally($race)));
        $delivery = (string) DB::table('webhook_deliveries')->where('endpoint_id', $endpoint->id)->value('id');
        ConcRace::run(array_fill(0, 12, ['op' => 'webhook_attempt', 'delivery' => $delivery]));
        $d = DB::table('webhook_deliveries')->where('id', $delivery)->first();
        $sent = ConcFakes::count('WEBHOOK', $delivery);
        Conc::check('12 workers claiming one delivery at once: one HTTP send, delivered, attempts=1', $sent === 1 && $d->state === 'delivered' && (int) $d->attempts === 1,
            'sent='.$sent.' state='.$d->state.' attempts='.$d->attempts);
        DB::table('jobs')->where('payload', 'like', '%DeliverPlatformWebhook%')->delete(); // jobs queued by the emits; later scenarios drain the queue
    }
}
