<?php
use Illuminate\Support\Facades\DB;

/** Scenario 2: lease claim races and stale-generation fencing while a lease is taken over. */
final class ConcLeases
{
    public static function run(): void
    {
        Conc::$scenario = '2 leases';
        self::oneRunManyClaimers();
        self::tenRunsFourteenClaimers();
        self::serialConversation();
        self::staleGenerations();
    }

    private static function claimJob(array $fx): array
    {
        return ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/claim'];
    }

    private static function oneRunManyClaimers(): void
    {
        $ok = true; $detail = [];
        for ($round = 0; $round < 5; $round++) {
            $fx = ConcFixture::make(false);
            $run = ConcFixture::admit($fx, 'One run, ten claimers');
            $race = ConcRace::run(array_fill(0, 10, self::claimJob($fx)));
            $t = Conc::tally($race);
            $row = DB::table('agent_runs')->find($run['id']);
            $claimedEvents = DB::table('agent_run_events')->where('run_id', $run['id'])->where('type', 'run.claimed')->count();
            $ok = $ok && $t === ['200' => 1, '204' => 9] && (int) $row->lease_generation === 1 && $claimedEvents === 1 && $row->state === 'starting';
            $detail[] = Conc::fmt($t).' gen='.$row->lease_generation;
        }
        Conc::check('5 rounds × 10 runner processes claiming one queued run: exactly one 200, nine 204, generation 1, one run.claimed event, state starting', $ok, implode(' | ', array_slice($detail, 0, 2)));
    }

    private static function tenRunsFourteenClaimers(): void
    {
        $fx = ConcFixture::make(false);
        $runs = [ConcFixture::admit($fx, 'Run 0')['id']];
        for ($i = 1; $i < 10; $i++) $runs[] = ConcFixture::admit($fx, 'Run '.$i, null, ConcFixture::teammate($fx, null))['id'];
        $race = ConcRace::run(array_fill(0, 14, self::claimJob($fx)));
        $t = Conc::tally($race);
        $got = array_filter(array_map(fn ($r) => $r['result']['json']['run']['id'] ?? null, $race));
        $gens = DB::table('agent_runs')->whereIn('id', $runs)->pluck('lease_generation')->map(fn ($g) => (int) $g)->unique()->all();
        Conc::check('10 runs on 10 teammates, 14 claimers: each run claimed exactly once (10×200 with 10 distinct runs, 4×204, all generation 1)',
            $t === ['200' => 10, '204' => 4] && count(array_unique($got)) === 10 && $gens === [1], Conc::fmt($t).' distinct='.count(array_unique($got)));
    }

    private static function serialConversation(): void
    {
        $fx = ConcFixture::make(false);
        $ids = array_map(fn ($i) => ConcFixture::admit($fx, 'Turn '.$i)['id'], range(1, 3));
        $race = ConcRace::run(array_fill(0, 6, self::claimJob($fx)));
        $claimed = array_values(array_filter(array_map(fn ($r) => $r['result']['json']['run']['id'] ?? null, $race)));
        Conc::check('3 queued turns of one teammate, 6 claimers: one claim, the oldest turn, never two turns of a conversation at once',
            $claimed === [$ids[0]], 'claimed='.count($claimed).' '.Conc::fmt(Conc::tally($race)));
    }

    /** Four takeovers at different moments of the old runner's stream (60/120/250/400 ms), invariants checked on each. */
    private static function staleGenerations(): void
    {
        $fails = []; $acc = 0; $rej = 0; $g1 = 0; $g2 = 0; $tools = 0;
        foreach ([60, 120, 250, 400] as $offset) {
            $fx = ConcFixture::make(true);
            ConcFixture::admit($fx, 'Stale generations');
            $c = ConcFixture::claim($fx);
            $jobs = [['op' => 'old_runner', 'fx' => $fx, 'run' => ['id' => $c['id'], 'generation' => $c['generation']], 'n' => 90]];
            for ($i = 0; $i < 5; $i++) $jobs[] = ['op' => 'takeover', 'fx' => $fx, 'run' => $c['id'], 'events' => 6];
            $race = ConcRace::start($jobs)->release();
            usleep($offset * 1000); // the old runner is mid-stream; its heartbeat stalls and the lease runs out
            DB::table('agent_runs')->where('id', $c['id'])->update(['lease_expires_at' => now()->subSeconds(5)]);
            $res = $race->results();
            $old = $res[0]['result']['calls'] ?? [];
            $winners = array_filter(array_slice($res, 1), fn ($r) => ($r['result']['claimStatus'] ?? 0) === 200);
            $events = DB::table('agent_run_events')->where('run_id', $c['id'])->orderBy('seq')->get();
            $claims = $events->filter(fn ($e) => $e->type === 'run.claimed');
            $gen2 = $events->first(fn ($e) => $e->type === 'run.claimed' && (json_decode($e->payload, true)['generation'] ?? 0) === 2);
            $text = fn ($e) => (json_decode($e->payload, true)['text'] ?? '');
            $e1 = $events->filter(fn ($e) => str_starts_with($text($e), 'g1-'));
            $e2 = $events->filter(fn ($e) => str_starts_with($text($e), 'g2-'));
            $row = DB::table('agent_runs')->find($c['id']);
            $accepted = array_filter($old, fn ($x) => $x[0] === 'event' && $x[2] === 200);
            $rejected = array_filter($old, fn ($x) => $x[2] !== 200);
            $oldTools = array_filter($old, fn ($x) => $x[0] === 'tool' && $x[2] === 200);
            $toolEvents = $events->filter(fn ($e) => $e->type === 'tool.requested' && str_starts_with((json_decode($e->payload, true)['callId'] ?? ''), 'old-'));
            $seqs = $events->pluck('seq')->map(fn ($s) => (int) $s)->all();
            $tag = '@'.$offset.'ms: ';
            if (count($winners) !== 1 || (int) $row->lease_generation !== 2 || $claims->count() !== 2) $fails[] = $tag.'takeover winners='.count($winners).' gen='.$row->lease_generation;
            if (!$gen2 || $e1->count() !== count($accepted) || !$e1->every(fn ($e) => $e->seq < $gen2->seq) || !$e2->every(fn ($e) => $e->seq > $gen2->seq) || $e2->count() !== 6) $fails[] = $tag.'old/new event order or loss';
            if (array_filter($rejected, fn ($x) => $x[2] !== 409 || $x[3] !== 'stale_lease')) $fails[] = $tag.'rejection was not 409 stale_lease';
            if (!$gen2 || $toolEvents->count() !== count($oldTools) || !$toolEvents->every(fn ($e) => $e->seq < $gen2->seq)) $fails[] = $tag.'stale tool call persisted';
            if ($seqs !== range(1, count($seqs)) || (int) $row->event_seq !== count($seqs)) $fails[] = $tag.'journal gap';
            $acc += count($old) - count($rejected); $rej += count($rejected); $g1 += $e1->count(); $g2 += $e2->count(); $tools += count($oldTools);
        }
        Conc::check('4 takeovers (5 racing claimers each) of an expired lease: exactly one winner, generation 1→2 once, one run.claimed per generation', !preg_grep('/takeover/', $fails), implode('; ', $fails) ?: '4/4 rounds');
        Conc::check('old-generation events/tool calls/heartbeats: accepted ones all journalled before the takeover and none lost; every later one 409 stale_lease; none persisted after it',
            !preg_grep('/event order|rejection|stale tool/', $fails), 'accepted='.$acc.' (events persisted '.$g1.', tool calls '.$tools.') rejected='.$rej.'; new-generation events='.$g2);
        Conc::check('journal gap-free and monotonic through every takeover', !preg_grep('/journal gap/', $fails));
    }
}
