<?php
use Illuminate\Support\Facades\DB;

/** Scenario 3: concurrent appends to one run's journal from many processes. */
final class ConcEvents
{
    public static function run(): void
    {
        Conc::$scenario = '3 events';
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Journal under load');
        $c = ConcFixture::claim($fx);
        $jobs = [];
        for ($p = 0; $p < 16; $p++) {
            $reqs = [];
            for ($n = 0; $n < 10; $n++) $reqs[] = ['kind' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/events',
                'json' => ['generation' => $c['generation'], 'events' => [['type' => 'message.delta', 'text' => 'p'.$p.'-'.$n]]]];
            $jobs[] = ['op' => 'seq', 'reqs' => $reqs];
        }
        $beat = ['kind' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/heartbeat', 'json' => ['generation' => $c['generation']]];
        $jobs[] = ['op' => 'seq', 'reqs' => array_fill(0, 15, $beat)];
        $jobs[] = ['op' => 'seq', 'reqs' => array_fill(0, 15, $beat)];
        $jobs[] = ['op' => 'seq', 'reqs' => [['kind' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/tools',
            'json' => ['generation' => $c['generation'], 'callId' => 'write-1', 'tool' => 'gmail_send', 'connectionId' => $fx['gmail'],
                'schemaRevision' => app(App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('gmail_send'),
                'arguments' => ['to' => 'a@example.com', 'subject' => 'S', 'body' => 'B']]]]];
        for ($i = 0; $i < 2; $i++) $jobs[] = ['op' => 'poll', 'run' => $c['id'], 'token' => $fx['token'], 'seconds' => 3];
        $race = ConcRace::run($jobs, 0, 120);

        $rows = DB::table('agent_run_events')->where('run_id', $c['id'])->orderBy('seq')->get();
        $seqs = $rows->pluck('seq')->map(fn ($s) => (int) $s)->all();
        $run = DB::table('agent_runs')->find($c['id']);
        Conc::check('16 processes × 10 runner events + heartbeats + a write-approval request + 2 pollers: journal seq is exactly 1..N, no gap, no duplicate, event_seq=N',
            $seqs === range(1, count($seqs)) && (int) $run->event_seq === count($seqs), 'N='.count($seqs).' event_seq='.$run->event_seq);
        $texts = $rows->filter(fn ($e) => $e->type === 'message.delta')->map(fn ($e) => json_decode($e->payload, true)['text'])->values()->all();
        Conc::check('all 160 runner events persisted exactly once', count($texts) === 160 && count(array_unique($texts)) === 160, 'delta events='.count($texts).' distinct='.count(array_unique($texts)));
        $ordered = true;
        foreach (range(0, 15) as $p) {
            $mine = array_values(array_filter($texts, fn ($t) => str_starts_with($t, 'p'.$p.'-')));
            $ordered = $ordered && $mine === array_map(fn ($n) => 'p'.$p.'-'.$n, range(0, 9));
        }
        Conc::check('each process\'s own events keep their order in the journal', $ordered);
        $pollers = array_map(fn ($r) => $r['result'] ?? [], array_slice($race, 19, 2));
        Conc::check('two cursor-following readers saw a gap-free prefix while writes were in flight (no hole ever visible)',
            !array_filter($pollers, fn ($p) => empty($p['contiguous']) || ($p['seen'] ?? 0) < 1), json_encode(array_map(fn ($p) => ['seen' => $p['seen'] ?? null, 'contiguous' => $p['contiguous'] ?? null], $pollers)));
        $bad = array_filter(array_slice($race, 0, 19), fn ($r) => isset($r['crash']) || isset($r['result']['crash']));
        Conc::check('no racing process crashed or got a server error', !$bad && !array_filter(array_slice($race, 0, 16), fn ($r) => array_filter($r['result']['responses'] ?? [], fn ($x) => $x['status'] >= 400)),
            'crashes='.count($bad));
    }
}
