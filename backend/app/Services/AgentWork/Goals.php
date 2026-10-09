<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\Run;
use App\Models\AgentWork\Goal;
use App\Services\AgentRuns\{ApiError, Runs, RunStates};
use Illuminate\Support\Facades\DB;

final class Goals
{
    public function activate(int $userId, array $spec, string $key): array
    {
        $spec = Specs::goal($spec);
        return app(Activations::class)->save($userId, 'goal', $spec, $key, function ($snapshot) use ($userId, $spec) {
            abort_if(Goal::where('user_id', $userId)->whereNotIn('status', ['completed', 'cancelled', 'expired'])->count() >= 50, 409, 'Keep at most 50 unfinished goals.');
            $goal = Goal::create(['user_id' => $userId, 'agent_id' => $spec['agentId'], 'title' => $spec['title'],
                'runtime_binding_id' => $spec['runtimeId'], 'runtime_snapshot' => $snapshot, 'expires_at' => $spec['expiresAt'],
                'milestones' => array_map(fn ($s) => [...$s, 'status' => 'pending', 'runId' => null], $spec['milestones'])]);
            return $this->payload($goal->fresh());
        }, fn ($id) => $this->payload($this->find($userId, $id)));
    }

    public function find(int $userId, string $id, bool $lock = false): Goal
    {
        $q = Goal::where('user_id', $userId)->whereKey($id);
        $row = ($lock ? $q->lockForUpdate() : $q)->first();
        if (!$row) ApiError::throw(404, 'goal_not_found', 'That goal does not exist.');
        return $row;
    }

    public function list(int $userId, ?string $agentId): array
    {
        return Goal::where('user_id', $userId)->when($agentId, fn ($q) => $q->where('agent_id', $agentId))
            ->orderByDesc('created_at')->limit(100)->get()->map(fn ($g) => $this->payload($g))->all();
    }

    public function control(int $userId, string $id, int $revision, string $action): array
    {
        return DB::transaction(function () use ($userId, $id, $revision, $action) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            $goal = $this->find($userId, $id, true); self::revision($goal, $revision);
            abort_unless(in_array($action, ['pause', 'resume', 'cancel'], true), 422, 'Choose pause, resume or cancel.');
            if (in_array($goal->status, ['completed', 'cancelled', 'expired'], true)) ApiError::throw(409, 'work_terminal', 'This goal is finished.');
            if ($action === 'resume') {
                Activations::enabled();
                abort_unless($goal->status === 'paused' && $goal->expires_at->isFuture(), 409, 'Only an unexpired paused goal can resume.');
                RuntimePins::require($userId, $goal->runtime_snapshot);
            }
            if ($action === 'pause') abort_unless(in_array($goal->status, ['active', 'awaiting_review', 'paused'], true), 409, 'This blocked goal needs a new reviewed plan.');
            if ($action === 'cancel') $this->cancelTasks($goal);
            $goal->forceFill(['status' => match ($action) { 'pause' => 'paused', 'resume' => 'active', default => 'cancelled' },
                'reason' => null, 'revision' => $goal->revision + 1])->save();
            return $this->payload($goal);
        });
    }

    public function confirm(int $userId, string $id, int $revision): array
    {
        return DB::transaction(function () use ($userId, $id, $revision) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            $goal = $this->find($userId, $id, true); self::revision($goal, $revision);
            abort_unless($goal->status === 'awaiting_review' && $goal->expires_at->isFuture(), 409, 'Review all delivered milestones before finishing.');
            foreach ($goal->milestones as $step) {
                $run = $step['runId'] ? Run::whereKey($step['runId'])->lockForUpdate()->first() : null;
                abort_unless($step['status'] === 'delivered' && Evidence::from($run, $userId, $goal->agent_id), 409, 'A required milestone has no completed task evidence.');
                abort_unless(RuntimePins::same($goal->runtime_snapshot, $run->runtime_snapshot), 409, 'A milestone used a different AI account.');
            }
            $goal->forceFill(['status' => 'completed', 'reason' => null, 'revision' => $goal->revision + 1])->save();
            return $this->payload($goal);
        });
    }

    public function cancelTasks(Goal $goal): void
    {
        foreach ($goal->milestones as $step) if ($step['runId']) {
            $run = Run::whereKey($step['runId'])->where('user_id', $goal->user_id)->first();
            if ($run && !RunStates::terminal($run->state)) app(Runs::class)->cancel($goal->user_id, $run->id);
        }
    }

    public function payload(Goal $goal): array
    {
        $runs = Run::where('user_id', $goal->user_id)->whereIn('id', array_filter(array_column($goal->milestones, 'runId')))->get()->keyBy('id');
        $steps = array_map(fn ($step) => [...$step, 'evidence' => Evidence::from($runs->get($step['runId']), (int) $goal->user_id, $goal->agent_id)], $goal->milestones);
        return ['id' => $goal->id, 'agentId' => $goal->agent_id, 'title' => $goal->title, 'revision' => $goal->revision,
            'status' => $goal->status, 'reason' => $goal->reason, 'runtimeId' => $goal->runtime_binding_id, 'runtime' => $goal->runtime_snapshot,
            'expiresAt' => $goal->expires_at->toIso8601String(), 'createdAt' => $goal->created_at?->toIso8601String(),
            'updatedAt' => $goal->updated_at?->toIso8601String(), 'milestones' => $steps,
            'progress' => ['delivered' => count(array_filter($steps, fn ($s) => $s['status'] === 'delivered')), 'total' => count($steps)]];
    }

    private static function revision(Goal $goal, int $revision): void
    {
        if ($goal->revision !== $revision) ApiError::throw(409, 'work_changed', 'This goal changed. Refresh it before deciding.');
    }
}
