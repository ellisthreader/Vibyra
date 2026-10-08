<?php

use App\Models\AgentV2\{Run, RuntimeBinding, Trigger};
use App\Models\AgentWork\{Goal, FollowUp};
use App\Services\AgentWork\{Goals, GoalProgress, FollowUps, FollowUpProgress};
use Illuminate\Support\Facades\DB;

final class ConcWorkCore
{
    public static function run(): void
    {
        config(['agents_v2.work_enabled' => true]);
        Conc::$scenario = 'Stage 4 saved work';
        $fx = ConcFixture::make(false); $spec = self::spec($fx); $model = $spec['modelForProof']; unset($spec['modelForProof']);
        $g = app(Goals::class)->activate($fx['user'], [...$spec, 'milestones' => [self::step('first'), self::step('second', ['first'])]], 'pg-goal');
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'work_core', 'mode' => 'goal_advance', 'id' => $g['id']])));
        Conc::check('six scanners admit one first milestone and one pinned run', ($race['200'] ?? 0) === 6
            && Run::where('agent_id', $fx['agent'])->count() === 1 && DB::table('agent_work_run_pins')->count() === 1, json_encode($race));
        $r = ConcFixture::claim($fx);
        ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$r['id'].'/complete', ['generation' => $r['generation'], 'answer' => 'First actual result']), 200);
        $revision = Goal::findOrFail($g['id'])->revision;
        $registration = ['hostId' => $fx['hostId'], 'provider' => 'codex', 'accountRef' => 'acct-1',
            'model' => 'changed-model', 'effort' => 'medium', 'providerVersion' => 'test', 'capabilities' => ['controlledTools' => true]];
        $jobs = [
            ['op' => 'work_core', 'mode' => 'goal_advance', 'id' => $g['id']],
            ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/claim'],
            ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runtimes', 'token' => $fx['token'], 'json' => $registration],
            ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/goals/'.$g['id'].'/control', 'token' => $fx['token'], 'json' => ['revision' => $revision, 'action' => 'cancel']],
            ['op' => 'work_core', 'mode' => 'goal_advance', 'id' => $g['id']],
        ];
        $race = Conc::tally(ConcRace::run($jobs));
        $runs = Run::where('agent_id', $fx['agent'])->get();
        Conc::check('binding rotation, claim, goal progress and cancellation race without deadlock or account drift',
            $runs->count() <= 2 && $runs->every(fn ($r) => $r->runtime_snapshot['model'] === $model)
            && !isset($race['500']), json_encode($race));
        $goal = Goal::findOrFail($g['id']);
        if (!in_array($goal->status, ['cancelled', 'completed', 'expired'], true)) app(Goals::class)->control($fx['user'], $g['id'], $goal->revision, 'cancel');
        Conc::check('confirmed cancellation leaves no unfinished goal task', Run::where('agent_id', $fx['agent'])->whereNotIn('state', ['completed', 'cancelled'])->count() === 0);
        $other = ConcFixture::make(false); $timed = self::spec($other);
        unset($timed['modelForProof']);
        $f = app(FollowUps::class)->activate($other['user'], [...$timed, 'prompt' => 'Review status',
            'condition' => ['kind' => 'time', 'at' => now()->addMinute()->toIso8601String()]], 'pg-followup');
        FollowUp::whereKey($f['id'])->update(['due_at' => now()->subSecond()]);
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'work_core', 'mode' => 'follow_advance', 'id' => $f['id']])));
        Conc::check('six due follow-up scanners create one linked task', ($race['200'] ?? 0) === 6
            && Run::where('idempotency_key', 'followup:'.$f['id'])->count() === 1 && FollowUp::find($f['id'])->status === 'admitted', json_encode($race));
        $eventFx = ConcFixture::make(false);
        $created = ConcHttp::call('POST', '/api/agents/v2/triggers', $eventFx['token'], ['agentId' => $eventFx['agent'],
            'runtimeId' => $eventFx['runtime']['id'], 'kind' => 'github.issue', 'filter' => ['repository' => 'acme/app', 'actions' => ['opened']],
            'promptTemplate' => 'Review event']);
        ConcFixture::ok($created, 201); $trigger = Trigger::findOrFail($created['json']['trigger']['id']);
        app(\App\Services\AgentTriggers\TriggerIntake::class)->receive($trigger, 'seed', 'github.issue', ['title' => 'Verified fixture'], 'github:acme/app#7');
        $eventSpec = self::spec($eventFx); unset($eventSpec['modelForProof']);
        $eventWork = app(FollowUps::class)->activate($eventFx['user'], [...$eventSpec, 'prompt' => 'Summarize this issue',
            'condition' => ['kind' => 'event', 'triggerId' => $trigger->id, 'triggerRevision' => $trigger->revision,
                'subject' => 'github:acme/app#7']], 'pg-event');
        $jobs = [];
        for ($i = 0; $i < 3; $i++) {
            $jobs[] = ['op' => 'work_core', 'mode' => 'source_event', 'id' => $trigger->id, 'key' => 'same-new-event', 'subject' => 'github:acme/app#7'];
            $jobs[] = ['op' => 'work_core', 'mode' => 'follow_advance', 'id' => $eventWork['id']];
        }
        $race = Conc::tally(ConcRace::run($jobs)); app(FollowUpProgress::class)->advance($eventWork['id']);
        Conc::check('duplicate verified event delivery races scanners into one follow-up admission', ($race['200'] ?? 0) === 6
            && Run::where('idempotency_key', 'followup:'.$eventWork['id'])->count() === 1
            && DB::table('agent_work_signals')->where('trigger_id', $trigger->id)->count() === 2, json_encode($race));
        $routine = ['agentId' => $other['agent'], 'runtimeId' => $other['runtime']['id'], 'title' => 'Weekly check',
            'prompt' => 'Summarize changes.', 'timezone' => 'UTC', 'recurrence' => ['type' => 'weekly', 'time' => '09:00', 'weekdays' => [1]]];
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'work_core', 'mode' => 'routine_activate',
            'user' => $other['user'], 'spec' => $routine, 'key' => 'pg-routine'])));
        Conc::check('lost routine activation responses replay one saved schedule', ($race['200'] ?? 0) === 6
            && DB::table('agent_schedules')->where('user_id', $other['user'])->count() === 1, json_encode($race));
    }

    private static function spec(array $fx): array
    {
        return ['agentId' => $fx['agent'], 'runtimeId' => $fx['runtime']['id'], 'title' => 'Concurrent goal',
            'expiresAt' => now()->addDay()->toIso8601String(), 'modelForProof' => $fx['runtime']['model']];
    }

    private static function step(string $key, array $dependencies = []): array
    {
        return ['key' => $key, 'title' => $key, 'prompt' => 'Produce '.$key.' evidence', 'successCriteria' => 'Saved result', 'dependsOn' => $dependencies];
    }
}
