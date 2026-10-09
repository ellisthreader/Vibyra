<?php
use App\Models\AgentCoordination\{Message, Workflow};
use App\Models\AgentV2\Run;
use App\Services\AgentCoordination\{Groups, WorkflowDraft, WorkflowProgress, Workflows};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class ConcCoordination
{
    public static function run(): void
    {
        config(['agents_v2.work_enabled' => true, 'agents_v2.coordination_enabled' => true]); Conc::$scenario = 'Stage 5 coordination';
        $fx = ConcFixture::make(false);
        $fx['runtime'] = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/runtimes', $fx['token'], ['hostId' => $fx['hostId'],
            'provider' => 'claude', 'accountRef' => 'reviewed-account', 'model' => 'sonnet', 'effort' => 'medium', 'providerVersion' => 'test',
            'capabilities' => ['controlledTools' => true, 'pinnedSkillsV1' => true, 'parallelJobsV1' => true, 'workerSlots' => 3]]), 201)['runtime'];
        $second = ConcFixture::teammate($fx, null);
        $groupBody = ['expectedRevision' => 0, 'name' => 'Reviewed team', 'coordinatorId' => $fx['agent'],
            'members' => [['agentId' => $fx['agent'], 'handle' => 'coordinator'], ['agentId' => $second, 'handle' => 'research']]];
        $group = app(Groups::class)->save($fx['user'], (string) Str::uuid(), $groupBody);
        $body = ['expectedRevision' => 1, 'runtimeId' => $fx['runtime']['id'], 'expectedRuntimeRevision' => $fx['runtime']['revision'], 'idempotencyKey' => 'group-send-pg',
            'prompt' => 'Prepare the test report.', 'mentions' => [], 'sharedContext' => ['text' => 'Explicit test context', 'outputs' => []]];
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'coordination', 'mode' => 'plan', 'user' => $fx['user'], 'group' => $group['id'], 'body' => $body])));
        Conc::check('six lost-response sends create one planning message and isolated run', ($race['200'] ?? 0) === 6
            && Message::where('user_id', $fx['user'])->count() === 1 && Run::where('user_id', $fx['user'])->count() === 1, json_encode($race));
        $message = Message::where('user_id', $fx['user'])->sole(); $plan = Run::findOrFail($message->planning_run_id);
        $steps = [self::step('left', $fx['agent']), self::step('right', $second), self::step('join', $second, ['left', 'right'])];
        $spec = [...WorkflowDraft::bind($plan, ['title' => 'Reviewed test workflow', 'expiresAt' => now()->addDay()->toIso8601String(),
            'steps' => $steps, 'finalCriteria' => 'A checked result from both branches.']), 'agentId' => $fx['agent'], 'runtimeId' => $fx['runtime']['id']];
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'coordination', 'mode' => 'activate', 'user' => $fx['user'], 'spec' => $spec, 'key' => 'accepted-pg'])));
        $w = Workflow::where('user_id', $fx['user'])->sole();
        Conc::check('six acceptance replays freeze one DAG and two independent roots', ($race['200'] ?? 0) === 6
            && Workflow::where('user_id', $fx['user'])->count() === 1 && Run::where('user_id', $fx['user'])->count() === 3, json_encode($race));
        foreach (array_slice($w->steps, 0, 2) as $step) Run::whereKey($step['runId'])->update(['state' => 'completed', 'answer' => $step['key'].' evidence', 'finished_at' => now()]);
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'coordination', 'mode' => 'advance', 'id' => $w->id]))); $w->refresh();
        Conc::check('six dependency scanners create exactly one joining task with both real results', ($race['200'] ?? 0) === 6
            && Run::where('user_id', $fx['user'])->count() === 4 && $w->steps[2]['runId'] !== null
            && str_contains(Run::find($w->steps[2]['runId'])->prompt, 'left evidence') && str_contains(Run::find($w->steps[2]['runId'])->prompt, 'right evidence'), json_encode($race));
        Run::whereKey($w->steps[2]['runId'])->update(['state' => 'completed', 'answer' => 'Joined evidence', 'finished_at' => now()]);
        $race = Conc::tally(ConcRace::run(array_fill(0, 6, ['op' => 'coordination', 'mode' => 'advance', 'id' => $w->id]))); $w->refresh();
        Conc::check('six final scanners create exactly one coordinator synthesis', ($race['200'] ?? 0) === 6
            && Run::where('user_id', $fx['user'])->count() === 5 && $w->final_run_id !== null, json_encode($race));
        $jobs = [
            ['op' => 'coordination', 'mode' => 'advance', 'id' => $w->id],
            ['op' => 'coordination', 'mode' => 'control', 'user' => $fx['user'], 'id' => $w->id, 'revision' => $w->revision, 'action' => 'cancel'],
            ['op' => 'coordination', 'mode' => 'group_save', 'user' => $fx['user'], 'id' => $group['id'], 'body' => [...$groupBody, 'expectedRevision' => 1, 'name' => 'Changed reviewed team']],
            ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/claim', 'json' => ['workerSlot' => 0]],
        ];
        $raw = ConcRace::run($jobs); $race = Conc::tally($raw);
        file_put_contents((getenv('CONC_RESULTS') ?: sys_get_temp_dir().'/coordination').'.race.json', json_encode($raw, JSON_PRETTY_PRINT));
        app(WorkflowProgress::class)->advance($w->id); $w->refresh();
        Conc::check('membership edits, claim, cancellation and scanner race without a server failure', !isset($race['500']) && !isset($race['crash'])
            && in_array($w->status, ['cancelled', 'blocked']) && Run::find($w->final_run_id)->state === 'cancelled', json_encode($race));
    }
    private static function step(string $key, string $agentId, array $depends = []): array
    {
        return ['key' => $key, 'agentId' => $agentId, 'title' => $key, 'prompt' => 'Produce '.$key.' evidence', 'successCriteria' => 'Saved checked result', 'dependsOn' => $depends];
    }
}
