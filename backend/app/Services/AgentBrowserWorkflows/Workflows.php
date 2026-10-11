<?php
namespace App\Services\AgentBrowserWorkflows;
use App\Models\AgentBrowserWorkflows\Workflow;
use App\Models\AgentV2\{Connection, Run};
use App\Services\AgentRuns\{ApiError, Canonical, Grants, Runs, RunStates};
use App\Services\AgentRuns\Jobs\{AccountLock, Membership};
use Illuminate\Support\Facades\DB;
final class Workflows
{
    public function find(int $userId, string $id, bool $lock = false): Workflow
    {
        $q = Workflow::query()->where('user_id', $userId)->whereKey($id);
        return ($lock ? $q->lockForUpdate() : $q)->firstOrFail();
    }
    public function list(int $userId, ?string $agentId): array
    {
        $q = Workflow::query()->where('user_id', $userId);
        if ($agentId) $q->where('agent_id', $agentId);
        return $q->orderByDesc('updated_at')->limit(100)->get()->map(fn ($w) => $this->payload($w))->all();
    }
    public function create(int $userId, array $data): array
    {
        self::gate($userId);
        return DB::transaction(function () use ($userId, $data) {
            AccountLock::force($userId);
            $hash = Canonical::hash($data);
            if ($w = Workflow::query()->whereKey($data['id'])->first()) {
                abort_unless($w->user_id === $userId, 404);
                if ($w->request_hash !== $hash) ApiError::throw(409, 'workflow_request_changed', 'That draft ID already holds another procedure.');
                return $this->payload($w);
            }
            abort_if(Workflow::query()->where('user_id', $userId)->count() >= 100, 422, 'Up to 100 taught procedures are supported.');
            $source = app(Runs::class)->find($userId, $data['sourceRunId']);
            \App\Services\AgentOrganizations\Instances::personalOnly($source->agent_id);
            app(Grants::class)->agent($userId, $source->agent_id);
            if (($source->runtime_snapshot['capabilities']['browserWorkflowsV1'] ?? false) !== true
                || ($source->runtime_snapshot['executionTarget'] ?? 'local') !== 'local')
                ApiError::throw(409, 'browser_teaching_runtime', 'Use an updated Mac browser task to demonstrate this procedure.');
            $pin = null; $connection = null;
            foreach ($source->grant_snapshot ?? [] as $candidate) {
                $c = Connection::query()->where('user_id', $userId)->where('provider', 'browser')->find($candidate['connectionId']);
                if ($c && !$c->revoked_at && $c->generation === $candidate['generation']) { $pin = $candidate; $connection = $c; break; }
            }
            if (!$pin) ApiError::throw(409, 'browser_teaching_access', 'Review this teammate’s browser sites before teaching it.');
            $steps = Steps::clean($data['steps'], $connection->scopes ?? []);
            $w = Workflow::query()->create(['id' => $data['id'], 'user_id' => $userId, 'agent_id' => $source->agent_id,
                'source_run_id' => $source->id, 'connection_id' => $connection->id, 'runtime_snapshot' => $source->runtime_snapshot,
                'grant_snapshot' => $pin, 'name' => $data['name'], 'steps' => $steps, 'revision' => 1,
                'review_hash' => Steps::hash($data['name'], $steps), 'request_hash' => $hash]);
            return $this->payload($w);
        });
    }
    public function update(int $userId, string $id, array $data): array
    {
        self::gate($userId);
        return DB::transaction(function () use ($userId, $id, $data) {
            AccountLock::force($userId); $w = $this->find($userId, $id, true);
            if ($w->skill_id) ApiError::throw(409, 'workflow_published', 'This tested version is saved. Record a new version to change its procedure.');
            $c = Connection::query()->where('user_id', $userId)->findOrFail($w->connection_id);
            $steps = Steps::clean($data['steps'], $c->scopes ?? []); $hash = Steps::hash($data['name'], $steps);
            if ($w->review_hash === $hash && in_array($w->revision, [$data['expectedRevision'], $data['expectedRevision'] + 1], true)) return $this->payload($w);
            if ($w->revision !== $data['expectedRevision']) ApiError::throw(409, 'workflow_changed', 'Reload this procedure before editing it.');
            $w->forceFill(['name' => $data['name'], 'steps' => $steps, 'review_hash' => $hash, 'revision' => $w->revision + 1,
                'test_run_id' => null])->save();
            return $this->payload($w);
        });
    }
    public function payload(Workflow $w): array
    {
        $run = $w->test_run_id ? Run::query()->where('user_id', $w->user_id)->find($w->test_run_id) : null;
        $context = $run ? Context::data($run->id) : null;
        $state = !$run ? 'untested' : (!RunStates::terminal($run->state) ? 'running'
            : ($run->state === RunStates::COMPLETED && $context && $context['revision'] === $w->revision
                && Progress::state($run, $context)['complete'] ? 'passed' : 'failed'));
        return ['id' => $w->id, 'agentId' => $w->agent_id, 'name' => $w->name, 'revision' => $w->revision,
            'steps' => $w->steps, 'parameters' => Steps::parameters($w->steps), 'reviewHash' => $w->review_hash,
            'testRunId' => $w->test_run_id, 'testState' => $state, 'skillId' => $w->skill_id, 'createdAt' => $w->created_at?->toIso8601String()];
    }
    public static function review(Workflow $w, array $data): void
    {
        if ($w->revision !== $data['expectedRevision'] || $w->review_hash !== $data['reviewHash'])
            ApiError::throw(409, 'workflow_changed', 'The reviewed procedure changed. Reload it and test the current steps.');
    }
    public static function gate(int $userId): void
    {
        Membership::require($userId);
        if (!config('agents_v2.browser_workflows_enabled')) ApiError::throw(409, 'browser_workflows_disabled', 'Browser teaching is unavailable.');
    }
}
