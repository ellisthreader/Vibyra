<?php
use Illuminate\Support\Facades\DB;

/** Scenario 6: GitHub webhook deliveries from many processes; one delivery ID is one run, and the hourly cap holds. */
final class ConcTriggers
{
    public static function run(): void
    {
        Conc::$scenario = '6 trigger webhooks';
        self::sameDelivery();
        self::rateCap();
    }

    private static function trigger(array $fx, array $extra = []): array
    {
        $r = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/triggers', $fx['token'], [...['agentId' => $fx['agent'], 'kind' => 'github.issue',
            'filter' => ['repository' => 'acme/app', 'actions' => ['opened']], 'promptTemplate' => 'Triage this new issue.'], ...$extra]), 201);
        return ['id' => $r['trigger']['id'], 'secret' => $r['webhook']['secret']];
    }

    private static function delivery(array $trigger, string $delivery, int $number = 7): array
    {
        $raw = json_encode(['action' => 'opened', 'repository' => ['full_name' => 'acme/app'], 'issue' => ['number' => $number, 'title' => 'Login broken',
            'body' => 'The login page is blank.', 'user' => ['login' => 'octocat'], 'labels' => [['name' => 'bug']], 'html_url' => 'https://github.com/acme/app/issues/'.$number]]);
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/hooks/github/'.$trigger['id'], 'raw' => $raw, 'headers' => ['X-Conc-Ip' => 'gh-'.$trigger['id'],
            'X-Hub-Signature-256' => 'sha256='.hash_hmac('sha256', $raw, $trigger['secret']), 'X-GitHub-Event' => 'issues', 'X-GitHub-Delivery' => $delivery]];
    }

    private static function sameDelivery(): void
    {
        $fx = ConcFixture::make(false);
        $t = self::trigger($fx);
        $race = ConcRace::run(array_fill(0, 20, self::delivery($t, 'delivery-'.bin2hex(random_bytes(6)))));
        $events = DB::table('agent_trigger_events')->where('trigger_id', $t['id'])->get();
        $runs = DB::table('agent_runs')->whereIn('idempotency_key', $events->map(fn ($e) => 'trg:'.$e->id))->count();
        $allRuns = DB::table('agent_runs')->where('user_id', $fx['user'])->count();
        $dup = count(array_filter($race, fn ($r) => ($r['result']['json']['duplicate'] ?? null) === true));
        Conc::check('20 parallel deliveries of the same GitHub delivery ID: one trigger event, exactly one run (key trg:<eventId>), 1 fresh + 19 duplicates, all 202',
            $events->count() === 1 && $runs === 1 && $allRuns === 1 && $dup === 19 && Conc::tally($race) === ['202' => 20], 'events='.$events->count().' runs='.$allRuns.' duplicates='.$dup.' '.Conc::fmt(Conc::tally($race)));
        $again = ConcRace::run(array_fill(0, 6, self::delivery($t, DB::table('agent_trigger_events')->where('trigger_id', $t['id'])->value('event_key') ? substr($events[0]->event_key, 7) : 'x')));
        Conc::check('…six late redeliveries afterwards are still no-ops', DB::table('agent_runs')->where('user_id', $fx['user'])->count() === 1 && Conc::tally($again) === ['202' => 6]);
    }

    private static function rateCap(): void
    {
        $ok = true; $detail = [];
        foreach ([1, 2, 3] as $round) {
            $fx = ConcFixture::make(false);
            $t = self::trigger($fx, ['ratePerHour' => 5]);
            $race = ConcRace::run(array_map(fn ($i) => self::delivery($t, 'dist-'.$round.'-'.$i.'-'.bin2hex(random_bytes(4)), $i), range(1, 20)));
            $by = DB::table('agent_trigger_events')->where('trigger_id', $t['id'])->get()->groupBy('state')->map->count()->all();
            $runs = DB::table('agent_runs')->where('user_id', $fx['user'])->count();
            ksort($by);
            $ok = $ok && ($by['admitted'] ?? 0) === 5 && ($by['skipped'] ?? 0) === 15 && $runs === 5 && Conc::tally($race) === ['202' => 20];
            $detail[] = json_encode($by).' runs='.$runs;
        }
        Conc::check('3 rounds of 20 parallel DISTINCT deliveries against ratePerHour=5: exactly 5 admitted (5 runs) and 15 skipped rate_limited', $ok, implode(' | ', $detail));
    }

    private static function sameSubject(): void
    {
        $fx = ConcFixture::make(false);
        $t = self::trigger($fx, ['ratePerHour' => 30]);
        $race = ConcRace::run(array_map(fn ($i) => self::delivery($t, 'subj-'.$i.'-'.bin2hex(random_bytes(4)), 7, 'Report '.$i), range(1, 20)));
        $by = DB::table('agent_trigger_events')->where('trigger_id', $t['id'])->get()->groupBy('state')->map->count()->all();
        $reasons = DB::table('agent_trigger_events')->where('state', 'skipped')->where('trigger_id', $t['id'])->pluck('reason')->unique()->values()->all();
        Conc::check('20 parallel DIFFERENT deliveries about one GitHub issue: exactly 1 admitted (1 run), 19 skipped subject_busy, all 202',
            ($by['admitted'] ?? 0) === 1 && ($by['skipped'] ?? 0) === 19 && $reasons === ['subject_busy'] && DB::table('agent_runs')->where('user_id', $fx['user'])->count() === 1
            && Conc::tally($race) === ['202' => 20], json_encode($by).' '.json_encode($reasons).' '.Conc::fmt(Conc::tally($race)));
    }

    private static function linear(): void
    {
        $fx = ConcFixture::make(false);
        $secret = 'lin_wh_'.bin2hex(random_bytes(12));
        $r = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/triggers', $fx['token'], ['agentId' => $fx['agent'], 'kind' => 'linear.issue',
            'filter' => ['actions' => ['created']], 'promptTemplate' => 'Look at this ticket.', 'signingSecret' => $secret]), 201);
        $raw = json_encode(['action' => 'create', 'type' => 'Issue', 'webhookTimestamp' => (int) round(microtime(true) * 1000), 'actor' => ['id' => 'someone-else-0001'],
            'data' => ['id' => 'issue-conc-1', 'identifier' => 'ENG-1', 'title' => 'Checkout fails', 'team' => ['key' => 'ENG']]]);
        $op = fn ($i) => ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/hooks/linear/'.$r['trigger']['id'], 'raw' => $raw,
            'headers' => ['X-Conc-Ip' => 'lin-'.$r['trigger']['id'], 'Linear-Signature' => hash_hmac('sha256', $raw, $secret), 'Linear-Delivery' => 'lin-dlv-'.$i]];
        $race = ConcRace::run(array_map($op, range(1, 20)));
        $dup = count(array_filter($race, fn ($x) => ($x['result']['json']['duplicate'] ?? null) === true));
        Conc::check('20 parallel replays of one signed Linear body: one event, one run, 19 duplicates, all 202',
            DB::table('agent_trigger_events')->where('trigger_id', $r['trigger']['id'])->count() === 1 && DB::table('agent_runs')->where('user_id', $fx['user'])->count() === 1
            && $dup === 19 && Conc::tally($race) === ['202' => 20], 'duplicates='.$dup.' '.Conc::fmt(Conc::tally($race)));
    }

    private static function slack(): void
    {
        $secret = (string) config('agents_v2.slack_signing_secret');
        if ($secret === '') { Conc::check('Slack signing secret exported by run.sh', false, 'SLACK_SIGNING_SECRET missing'); return; }
        $fx = ConcFixture::make(false);
        DB::table('vibes_integration_installs')->updateOrInsert(['user_id' => $fx['user'], 'integration' => 'slack'], ['credential' => \Illuminate\Support\Facades\Crypt::encryptString('xoxp-conc'),
            'account_label' => 'Acme · T0CONC0001/U0CONC0001', 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        \App\Services\AgentRuns\Connections\LegacyInstalls::sync($fx['user']);
        $conn = (string) DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'slack')->value('id');
        DB::table('agent_connections')->where('id', $conn)->update(['scopes' => json_encode(['app_mentions:read'])]);
        ConcFixture::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$fx['agent'].'/grants/'.$conn, $fx['token'], ['operations' => ['slack_read_channel']]), 200);
        $t = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/triggers', $fx['token'], ['agentId' => $fx['agent'], 'kind' => 'slack.mention', 'connectionId' => $conn,
            'promptTemplate' => 'Answer the mention.', 'ratePerHour' => 30]), 201)['trigger'];
        $event = fn (string $id, string $ts) => json_encode(['type' => 'event_callback', 'event_id' => $id, 'team_id' => 'T0CONC0001', 'authorizations' => [['user_id' => 'U0BOT0CONC', 'is_bot' => true]],
            'event' => ['type' => 'app_mention', 'user' => 'U0HUMAN0001', 'text' => '<@U0BOT0CONC> hi', 'channel' => 'C0CONC00001', 'ts' => $ts, 'thread_ts' => '1700000000.000100']]);
        $op = function (string $raw) {
            $ts = (string) time();
            return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/hooks/slack', 'raw' => $raw, 'headers' => ['X-Conc-Ip' => 'slack-'.crc32($raw),
                'X-Slack-Request-Timestamp' => $ts, 'X-Slack-Signature' => 'v0='.hash_hmac('sha256', 'v0:'.$ts.':'.$raw, (string) config('agents_v2.slack_signing_secret'))]];
        };
        $same = $event('EvCONCSAME01', '1700000000.000200');
        $race = ConcRace::run(array_map(fn () => $op($same), range(1, 20)));
        $queued = count(array_filter($race, fn ($x) => ($x['result']['json']['state'] ?? null) === 'queued'));
        $jobs = DB::table('jobs')->where('payload', 'like', '%ProcessSlackEvent%')->count();
        Conc::check('20 parallel deliveries/retries of one Slack event_id: all 200, exactly 1 queued job (the ack never admits inline)',
            $queued === 1 && $jobs === 1 && Conc::tally($race) === ['200' => 20] && DB::table('agent_trigger_events')->where('trigger_id', $t['id'])->count() === 0,
            'queued='.$queued.' jobs='.$jobs.' '.Conc::fmt(Conc::tally($race)));
        $race = ConcRace::run(array_map(fn ($i) => $op($event('EvCONCTHRD'.str_pad((string) $i, 2, '0', STR_PAD_LEFT), '1700000000.0003'.str_pad((string) $i, 2, '0', STR_PAD_LEFT))), range(1, 10)));
        $workers = [new ConcWorkers, new ConcWorkers];
        foreach ($workers as $w) $w->start();
        $drained = ConcWorkers::drain();
        foreach ($workers as $w) $w->stopAll();
        $by = DB::table('agent_trigger_events')->where('trigger_id', $t['id'])->get()->groupBy('state')->map->count()->all();
        Conc::check('…then 11 queued mentions of ONE thread through 2 real workers: exactly 1 admitted run, 10 skipped subject_busy',
            $drained && ($by['admitted'] ?? 0) === 1 && ($by['skipped'] ?? 0) === 10 && DB::table('agent_runs')->where('user_id', $fx['user'])->count() === 1,
            'drained='.var_export($drained, true).' '.json_encode($by).' '.$w->stderr());
    }

}
