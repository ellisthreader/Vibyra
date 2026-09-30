<?php
use Illuminate\Support\Facades\DB;

/** Scenario 5: the routines tick from several processes; every due occurrence admits exactly one run. */
final class ConcSchedules
{
    public static function run(): void
    {
        Conc::$scenario = '5 scheduler';
        self::fiveArtisanProcesses();
        self::eightBarrierTicks();
        self::killedBetweenClaimAndAdmit();
    }

    /** @return array{0: array, 1: list<string>} fixture and the ids of n schedules, all due 20 s ago */
    private static function dueSchedules(int $n): array
    {
        $fx = ConcFixture::make(false);
        $agents = [$fx['agent'], ConcFixture::teammate($fx, null), ConcFixture::teammate($fx, null)];
        $ids = [];
        for ($i = 0; $i < $n; $i++) {
            $r = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/schedules', $fx['token'], ['agentId' => $agents[$i % 3], 'prompt' => 'Routine '.$i,
                'timezone' => 'UTC', 'recurrence' => ['type' => 'daily', 'time' => '09:00']], ['X-Conc-Ip' => 's'.$i]), 201);
            $ids[] = $r['schedule']['id'];
        }
        DB::table('agent_schedules')->whereIn('id', $ids)->update(['next_run_at' => now()->subSeconds(20)]);
        return [$fx, $ids];
    }

    private static function audit(array $ids, string $what, ?array $sums = null): void
    {
        $occ = DB::table('agent_schedule_occurrences')->whereIn('schedule_id', $ids)->get();
        $perSchedule = $occ->groupBy('schedule_id')->map->count();
        $runs = DB::table('agent_runs')->whereIn('idempotency_key', $occ->map(fn ($o) => 'sched:'.$o->schedule_id.':'.$o->revision.':'.strtotime($o->intended_at.' UTC'))->all())->get();
        $allRuns = DB::table('agent_runs')->where('idempotency_key', 'like', 'sched:%')->whereIn('user_id', DB::table('agent_schedules')->whereIn('id', $ids)->pluck('user_id'))->count();
        $moved = DB::table('agent_schedules')->whereIn('id', $ids)->where('next_run_at', '>', now())->count();
        $states = $occ->groupBy('state')->map->count()->all();
        ksort($states);
        Conc::check($what.': '.count($ids).' due schedules → '.count($ids).' occurrences (one each), '.count($ids).' runs (one each, key sched:<id>:<rev>:<ts>), every next_run_at advanced once',
            $occ->count() === count($ids) && $perSchedule->every(fn ($c) => $c === 1) && $perSchedule->count() === count($ids) && $runs->count() === count($ids) && $allRuns === count($ids)
            && $moved === count($ids) && ($sums === null || $sums['claimed'] === count($ids)), 'occurrences='.$occ->count().' runs='.$runs->count().' all sched runs='.$allRuns.' moved='.$moved
            .' states='.json_encode($states).($sums ? ' Σclaimed='.$sums['claimed'].' Σadmitted='.$sums['admitted'] : ''));
    }

    private static function fiveArtisanProcesses(): void
    {
        [, $ids] = self::dueSchedules(12);
        $res = ConcRace::artisans(5, ['vibyra:agent-v2-routines']);
        $sums = ['claimed' => 0, 'admitted' => 0];
        foreach ($res as $r) if (preg_match('/claimed=(\d+) admitted=(\d+)/', $r['out'], $m)) { $sums['claimed'] += (int) $m[1]; $sums['admitted'] += (int) $m[2]; }
        Conc::check('5 parallel `php artisan vibyra:agent-v2-routines` processes all exit 0', count(array_filter($res, fn ($r) => $r['exit'] === 0)) === 5, implode(' | ', array_map(fn ($r) => $r['out'], $res)));
        self::audit($ids, '5 artisan processes', $sums);
    }

    private static function eightBarrierTicks(): void
    {
        [, $ids] = self::dueSchedules(12);
        $race = ConcRace::run(array_fill(0, 8, ['op' => 'tick']));
        $sums = ['claimed' => 0, 'admitted' => 0];
        foreach ($race as $r) { $sums['claimed'] += $r['result']['tick']['claimed'] ?? 0; $sums['admitted'] += $r['result']['tick']['admitted'] ?? 0; }
        self::audit($ids, '8 barrier-released Scheduler::tick() processes', $sums);
    }

    private static function killedBetweenClaimAndAdmit(): void
    {
        [, $ids] = self::dueSchedules(6);
        $race = ConcRace::run(array_map(fn ($id) => ['op' => 'claim_then_die', 'schedule' => $id], array_slice($ids, 0, 6)));
        $died = count(array_filter($race, fn ($r) => !empty($r['killed'])));
        $pending = DB::table('agent_schedule_occurrences')->whereIn('schedule_id', $ids)->where('state', 'pending')->count();
        $runsBefore = DB::table('agent_runs')->where('idempotency_key', 'like', 'sched:'.$ids[0].'%')->count();
        Conc::check('6 schedulers killed (SIGKILL) right after winning the occurrence claim: 6 occurrences left pending, no run yet', $died === 6 && $pending === 6 && $runsBefore === 0, 'killed='.$died.' pending='.$pending);
        DB::table('agent_schedules')->whereIn('id', $ids)->update(['next_run_at' => DB::raw('next_run_at')]); // untouched: the crashed claim already moved it
        $res = ConcRace::artisans(4, ['vibyra:agent-v2-routines']);
        self::audit($ids, 'recovery ticks (4 artisan processes) after the kills');
        Conc::check('…the orphaned occurrences were admitted by the next tick, none twice, none left pending', DB::table('agent_schedule_occurrences')->whereIn('schedule_id', $ids)->where('state', 'pending')->count() === 0
            && count(array_filter($res, fn ($r) => $r['exit'] === 0)) === 4);
    }
}
