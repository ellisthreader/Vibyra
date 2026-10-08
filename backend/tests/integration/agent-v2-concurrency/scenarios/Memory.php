<?php
use Illuminate\Support\Facades\DB;

/** Structured memory's agent lock protects deduplication, key supersession and review revisions. */
final class ConcMemory
{
    public static function run(): void
    {
        Conc::$scenario = 'stage2 memory';
        $fx = ConcFixture::make(false);
        $path = '/api/agents/v2/teammates/'.$fx['agent'].'/memories';
        $page = ConcFixture::ok(ConcHttp::call('GET', $path, $fx['token']), 200);
        $scope = ['runtimeId' => $page['runtimeId'], 'accountScope' => $page['accountScope']];
        $post = ['op' => 'call', 'method' => 'POST', 'uri' => $path, 'token' => $fx['token'],
            'json' => $scope + ['fact' => 'Timezone London', 'key' => 'timezone']];
        $race = ConcRace::run(array_fill(0, 8, $post), 0);
        $rows = DB::table('agent_memories')->where('agent_id', $fx['agent'])->get();
        Conc::check('8 identical memory additions produce one row', $rows->count() === 1 && (Conc::tally($race)['201'] ?? 0) === 8,
            Conc::fmt(Conc::tally($race)));
        $id = $rows[0]->id;
        $jobs = array_map(fn ($i) => ['op' => 'call', 'method' => 'PATCH', 'uri' => $path.'/'.$id,
            'token' => $fx['token'], 'json' => $scope + ['revision' => 1, 'action' => 'correct', 'fact' => 'Timezone '.$i]], range(1, 8));
        $race = ConcRace::run($jobs, 0);
        $t = Conc::tally($race);
        Conc::check('8 corrections of the same revision have one winner and seven stale refusals',
            ($t['200'] ?? 0) === 1 && ($t['409:memory_changed'] ?? 0) === 7, Conc::fmt($t));
        $jobs = array_map(fn ($i) => ['op' => 'call', 'method' => 'POST', 'uri' => $path, 'token' => $fx['token'],
            'json' => $scope + ['fact' => 'Timezone place '.$i, 'key' => 'timezone']], range(1, 8));
        $race = ConcRace::run($jobs, 0);
        $active = DB::table('agent_memories')->where('agent_id', $fx['agent'])->where('key', 'timezone')->where('status', 'active')->count();
        Conc::check('parallel contradictory keyed facts leave exactly one active memory',
            $active === 1 && (Conc::tally($race)['201'] ?? 0) === 8, 'active='.$active.' '.Conc::fmt(Conc::tally($race)));
    }
}
