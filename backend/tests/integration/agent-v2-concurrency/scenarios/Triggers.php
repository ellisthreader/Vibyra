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
}
