<?php
use Illuminate\Support\Facades\DB;

/** Scenario 4c: a run reaches exactly one terminal state however complete, fail and cancel race; hooks fire once. */
final class ConcTerminal
{
    public static function run(): void
    {
        Conc::$scenario = '4c terminal states + outbox';
        self::completeFailCancel();
        self::notificationHookTwice();
    }

    private static function completeFailCancel(): void
    {
        $rounds = 16; $finals = []; $codes = []; $bad = []; $deadlocks0 = ConcPg::count('deadlock detected');
        foreach (range(0, $rounds - 1) as $i) {
            $fx = ConcFixture::make(false);
            $run = ConcFixture::admit($fx, 'Finish.');
            $c = ConcFixture::claim($fx);
            $runner = fn (string $path, array $json, int $jitter) => ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].$path, 'json' => $json, 'jitterMs' => $jitter];
            $g = ['generation' => $c['generation']];
            $jobs = [$runner('/complete', [...$g, 'answer' => 'Done.'], [0, 1, 3][$i % 3]), $runner('/complete', [...$g, 'answer' => 'Done.'], 2),
                $runner('/fail', [...$g, 'code' => 'runner_error', 'reason' => 'Crashed.'], [1, 0, 4][$i % 3]),
                ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$c['id'].'/cancel', 'token' => $fx['token'], 'jitterMs' => [2, 6, 12, 20][$i % 4]]];
            $race = ConcRace::run($jobs);
            foreach (Conc::tally($race) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $row = DB::table('agent_runs')->find($c['id']);
            $finals[$row->state] = ($finals[$row->state] ?? 0) + 1;
            $hooks = DB::table('agent_run_events')->where('run_id', $c['id'])->whereIn('type', ['run.completed', 'run.failed', 'run.cancelled', 'run.outcome_unknown'])->pluck('type')->all();
            $finals_ = DB::table('agent_run_events')->where('run_id', $c['id'])->where('type', 'message.final')->count();
            $items = DB::table('notification_items')->where('user_id', $fx['user'])->count();
            $seqs = DB::table('agent_run_events')->where('run_id', $c['id'])->orderBy('seq')->pluck('seq')->map(fn ($s) => (int) $s)->all();
            $expectHook = ['completed' => 'run.completed', 'failed' => 'run.failed', 'cancelled' => 'run.cancelled'][$row->state] ?? null;
            $ok = $expectHook && $hooks === [$expectHook] && $row->finished_at !== null && ($row->state === 'completed' ? $row->answer === 'Done.' && $finals_ === 1 : $row->answer === null && $finals_ === 0)
                && $items === (in_array($row->state, ['completed', 'failed'], true) ? 1 : 0) && $seqs === range(1, count($seqs)) && (int) $row->event_seq === count($seqs);
            if (!$ok) $bad[] = 'round '.$i.' state='.$row->state.' hooks='.json_encode($hooks).' final-events='.$finals_.' items='.$items;
        }
        ksort($finals); ksort($codes);
        Conc::check($rounds.' rounds of complete×2 + fail + cancel at once: exactly one terminal state and one terminal hook; only a completed run has an answer/message.final; a notification item only for completed/failed; journal gap-free',
            !$bad, 'final states '.json_encode($finals).'; HTTP outcomes '.Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', array_slice($bad, 0, 3)) : ''));
        Conc::check('…no deadlock and no 5xx between complete, fail and cancel', ConcPg::count('deadlock detected') === $deadlocks0 && !array_intersect_key($codes, array_flip(['500', '503', 'crash', '500:'])), json_encode($codes));
    }

    private static function notificationHookTwice(): void
    {
        [$fx, $runId, $delivery, $item] = ConcWorkers::completedRun();
        $event = DB::table('agent_run_events')->where('run_id', $runId)->where('type', 'run.completed')->value('id');
        $race = ConcRace::run(array_fill(0, 8, ['op' => 'notify', 'event' => $event]));
        $items = DB::table('notification_items')->where('user_id', $fx['user'])->count();
        $deliveries = DB::table('notification_deliveries')->where('item_id', $item)->count();
        $works = DB::table('work_events')->where('source', 'agent_run')->where('run_id', $runId)->count();
        Conc::check('the notification hook for one journal event run 8 times at once: one work event, one inbox item, one delivery per device (the outbox is idempotent)',
            $items === 1 && $deliveries === 1 && $works === 1 && !array_filter($race, fn ($r) => isset($r['result']['crash'])), 'items='.$items.' deliveries='.$deliveries.' work events='.$works
            .(($crash = array_values(array_filter(array_map(fn ($r) => $r['result']['crash'] ?? null, $race)))) ? ' crash: '.substr($crash[0], 0, 120) : ''));
    }
}
