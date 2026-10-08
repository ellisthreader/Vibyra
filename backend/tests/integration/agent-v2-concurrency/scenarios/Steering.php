<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Real process races at the instruction/lease/approval boundary. No provider traffic leaves the harness. */
final class ConcSteering
{
    private static function fixture(bool $gmail): array {
        $fx = ConcFixture::make($gmail);
        DB::table('agent_runtime_bindings')->where('id', $fx['runtime']['id'])->update(['capabilities' => json_encode(['controlledTools' => true, 'taskSteering' => true])]);
        return $fx;
    }

    private static function submit(array $fx, string $run, string $key, string $text = 'Only Friday'): array
    {
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$run.'/instructions',
            'token' => $fx['token'], 'json' => ['idempotencyKey' => $key, 'expectedRevision' => 0, 'text' => $text]];
    }

    public static function run(): void
    {
        Conc::$scenario = 'stage2 steering';
        $fx = self::fixture(false); $run = ConcFixture::admit($fx, 'Original request');
        $race = ConcRace::run(array_fill(0, 10, self::submit($fx, $run['id'], (string) Str::uuid())));
        Conc::check('10 identical concurrent corrections: one immutable revision, ten successful acknowledgements',
            Conc::tally($race) === ['200' => 10] && DB::table('agent_run_instructions')->where('run_id', $run['id'])->count() === 1,
            Conc::fmt(Conc::tally($race)));
        $fx = self::fixture(false); $run = ConcFixture::admit($fx, 'Original request');
        $jobs = array_map(fn ($i) => self::submit($fx, $run['id'], (string) Str::uuid(), 'Correction '.$i), range(1, 10));
        $race = ConcRace::run($jobs);
        Conc::check('10 conflicting revisions: one correction wins and nine require refresh',
            Conc::tally($race) === ['200' => 1, '409:instruction_changed' => 9]
                && DB::table('agent_runs')->where('id', $run['id'])->value('prompt') === 'Original request',
            Conc::fmt(Conc::tally($race)));
        $fx = self::fixture(false); $run = ConcFixture::admit($fx, 'Original request'); ConcFixture::claim($fx);
        $job = self::submit($fx, $run['id'], (string) Str::uuid());
        ConcFixture::ok(ConcHttp::call('POST', $job['uri'], $fx['token'], $job['json']), 200);
        $checkpoint = ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$run['id'].'/checkpoint', 'json' => ['generation' => 1]];
        $heartbeat = [...$checkpoint, 'suffix' => '/runs/'.$run['id'].'/heartbeat'];
        $race = ConcRace::run([...array_fill(0, 10, $checkpoint), ...array_fill(0, 5, $heartbeat)]);
        $claims = ConcRace::run(array_fill(0, 10, ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/claim']));
        Conc::check('10 checkpoint retries race 5 heartbeats then 10 claimers: released lease stays released, one acknowledgement and new lease',
            Conc::tally($race) === ['200' => 15] && Conc::tally($claims) === ['200' => 1, '204' => 9]
                && DB::table('agent_run_events')->where('run_id', $run['id'])->where('type', 'instruction.checkpoint')->count() === 1
                && DB::table('agent_runs')->where('id', $run['id'])->value('lease_generation') === 2,
            Conc::fmt(Conc::tally($race)).' claims '.Conc::fmt(Conc::tally($claims)));
        self::approvalRaces();
    }

    private static function approvalRaces(): void
    {
        $bad = []; $deadlocks = ConcPg::count('deadlock detected');
        for ($round = 0; $round < 5; $round++) {
            $fx = self::fixture(true); ConcFixture::admit($fx, 'Send a summary'); $run = ConcFixture::claim($fx);
            $action = ConcFixture::write($fx, $run, ['to' => 'qa@example.test', 'subject' => 'Test', 'body' => 'Original'], 'send');
            $steer = self::submit($fx, $run['id'], (string) Str::uuid(), 'Do not send it');
            $steer['jitterMs'] = $round * 10;
            $approve = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/actions/'.$action['id'].'/decision', 'token' => $fx['token'],
                'json' => ['fingerprint' => $action['fingerprint'], 'decision' => 'allow']];
            $race = ConcRace::start([$steer, $approve, $approve], 0, ['CONC_SEND_DELAY_MS' => '50'])->release()->results();
            $sends = DB::table('conc_calls')->where('kind', 'GMAIL_SEND')->where('ckey', 'tok-'.$fx['user'])->count();
            $row = DB::table('agent_tool_actions')->find($action['id']);
            $receipts = DB::table('agent_receipts')->where('action_id', $action['id'])->count();
            if ($sends > 1 || ($sends === 0 && $row->state !== 'cancelled') || ($sends === 1 && ($row->state !== 'completed' || $receipts !== 1)))
                $bad[] = 'round '.$round.' sends='.$sends.' state='.$row->state;
            foreach ($race as $reply) if (($reply['result']['status'] ?? 500) >= 500) $bad[] = 'server error';
        }
        Conc::check('5 approval/steering races: undispatched actions cancel; dispatched writes settle once with one receipt; no deadlocks or 5xx',
            !$bad && ConcPg::count('deadlock detected') === $deadlocks, implode('; ', $bad));
    }
}
