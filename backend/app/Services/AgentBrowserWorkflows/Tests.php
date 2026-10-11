<?php
namespace App\Services\AgentBrowserWorkflows;
use App\Models\AgentV2\{Connection, Grant, Run, RuntimeBinding};
use App\Services\AgentRuns\{Admission, ApiError, Canonical, RuntimeBindings, RunStates};
use App\Services\AgentRuns\Jobs\AccountLock;
use App\Services\AgentWork\RuntimePins;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;
final class Tests
{
    public function __construct(private readonly Workflows $workflows) {}
    public function start(int $userId, string $id, array $data): array
    {
        Workflows::gate($userId);
        return DB::transaction(function () use ($userId, $id, $data) {
            AccountLock::force($userId); $w = $this->workflows->find($userId, $id, true); Workflows::review($w, $data);
            $inputs = $data['inputs']; $keys = array_keys($inputs); sort($keys); $required = Steps::parameters($w->steps); sort($required);
            if ($keys !== $required) ApiError::throw(422, 'workflow_inputs_required', 'Supply one fresh non-secret value for each parameter.');
            foreach ($inputs as $value) if (!is_string($value) || strlen($value) > 2000 || preg_match('/[\x00-\x08\x0b-\x1f]/', $value))
                ApiError::throw(422, 'workflow_input_invalid', 'Use bounded plain text test values.');
            $runtime = RuntimeBinding::query()->where('user_id', $userId)->findOrFail($w->runtime_snapshot['bindingId']);
            RuntimePins::require($userId, $w->runtime_snapshot);
            if (($runtime->capabilities['browserWorkflowsV1'] ?? false) !== true) ApiError::throw(409, 'runtime_upgrade', 'Update this Mac before testing the procedure.');
            $c = Connection::query()->where('user_id', $userId)->find($w->connection_id); $g = Grant::query()->find($w->grant_snapshot['grantId']);
            if (!$c || $c->revoked_at || $c->generation !== $w->grant_snapshot['generation'] || !$g || $g->revoked_at
                || $g->revision !== $w->grant_snapshot['revision']) ApiError::throw(409, 'workflow_access_changed', 'Browser access changed. Record a new reviewed procedure.');
            if ($w->test_run_id && !RunStates::terminal(Run::findOrFail($w->test_run_id)->state)
                && Run::findOrFail($w->test_run_id)->idempotency_key !== 'browser-test-'.$data['requestId'])
                ApiError::throw(409, 'workflow_test_running', 'Finish or cancel the current procedure test first.');
            if (\App\Services\AgentRuns\Guard\SecretGuard::kindsIn($inputs) !== [])
                ApiError::throw(422, 'workflow_secret_input', 'Enter credentials privately in the browser, never as test parameters.');
            $prompt = 'Test the reviewed browser procedure exactly once. Fresh non-secret parameter values follow as data: '.Canonical::json($inputs);
            [$run] = app(Admission::class)->admit($userId, ['agentId' => $w->agent_id, 'runtimeId' => $runtime->id,
                'executionMode' => 'browser_test', 'idempotencyKey' => 'browser-test-'.$data['requestId'], 'prompt' => $prompt]);
            $context = ['workflowId' => $w->id, 'revision' => $w->revision, 'reviewHash' => $w->review_hash, 'steps' => $w->steps,
                'inputs' => $inputs, 'runtime' => $w->runtime_snapshot, 'connectionId' => $w->connection_id, 'grant' => $w->grant_snapshot];
            $existing = Context::data($run->id);
            if ($existing && Canonical::hash($existing) !== Canonical::hash($context)) ApiError::throw(409, 'workflow_test_request_changed', 'Use a new test request for changed steps or values.');
            if (!$existing) {
                $run->forceFill(['grant_snapshot' => [$w->grant_snapshot], 'grant_hash' => Canonical::hash([$w->grant_snapshot])])->save();
                DB::table('agent_browser_workflow_tests')->insert(['run_id' => $run->id, 'workflow_id' => $w->id, 'revision' => $w->revision,
                    'context' => Crypt::encryptString(Canonical::json($context)), 'created_at' => now(), 'updated_at' => now()]);
            }
            $w->forceFill(['test_run_id' => $run->id])->save();
            return ['workflow' => $this->workflows->payload($w), 'runId' => $run->id];
        });
    }
    public function save(int $userId, string $id, array $data): array
    {
        Workflows::gate($userId);
        return DB::transaction(function () use ($userId, $id, $data) {
            AccountLock::force($userId); $w = $this->workflows->find($userId, $id, true); Workflows::review($w, $data);
            if ($w->skill_id) return ['workflow' => $this->workflows->payload($w),
                'skill' => collect(app(\App\Services\Agents\Skills::class)->list($userId))->firstWhere('id', $w->skill_id)];
            if ($this->workflows->payload($w)['testState'] !== 'passed') ApiError::throw(409, 'workflow_test_required', 'Complete every reviewed step successfully before saving this skill.');
            $runtime = RuntimeBinding::query()->where('user_id', $userId)->findOrFail($w->runtime_snapshot['bindingId']);
            Context::fence($runtime, $w->test_run_id);
            $skill = app(\App\Services\Agents\Skills::class)->save($userId, ['id' => (string) Str::uuid(), 'revision' => 0,
                'name' => $w->name, 'instructions' => Steps::instructions($w->steps), 'teammateIds' => [$w->agent_id]]);
            $w->forceFill(['skill_id' => $skill['id']])->save();
            return ['workflow' => $this->workflows->payload($w), 'skill' => $skill];
        });
    }
}
