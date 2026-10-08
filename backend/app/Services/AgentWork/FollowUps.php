<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\Run;
use App\Models\AgentWork\FollowUp;
use App\Services\AgentRuns\{ApiError, Runs, RunStates};
use Illuminate\Support\Facades\DB;

final class FollowUps
{
    public function activate(int $userId, array $spec, string $key): array
    {
        $spec = Specs::followup($spec);
        return app(Activations::class)->save($userId, 'followup', $spec, $key, function ($snapshot) use ($userId, $spec) {
            abort_if(FollowUp::where('user_id', $userId)->whereIn('status', ['active', 'paused', 'blocked', 'admitted'])->count() >= 100, 409, 'Keep at most 100 unfinished follow-ups.');
            $c = $spec['condition']; $trigger = null; $cursor = 0;
            if ($c['kind'] !== 'time') {
                $sources = app(FollowUpSources::class);
                $trigger = $sources->source($userId, $spec['agentId'], $c, true);
                abort_unless(in_array($c['subject'], array_column($sources->subjects($trigger), 'subject'), true), 422, 'Choose a resource already observed by this event source.');
                $cursor = (int) DB::table('agent_work_signals')->where('trigger_id', $trigger->id)->max('id');
            }
            $row = FollowUp::create(['user_id' => $userId, 'agent_id' => $spec['agentId'], 'title' => $spec['title'],
                'runtime_binding_id' => $spec['runtimeId'], 'runtime_snapshot' => $snapshot, 'expires_at' => $spec['expiresAt'],
                'prompt' => $spec['prompt'], 'condition' => $c, 'trigger_id' => $trigger?->id, 'trigger_revision' => $trigger?->revision,
                'source_snapshot' => $trigger ? FollowUpAuthority::snapshot($trigger) : null, 'signal_cursor' => $cursor, 'due_at' => $c['at'] ?? null, 'activated_at' => now()]);
            return $this->payload($row->fresh());
        }, fn ($id) => $this->payload($this->find($userId, $id)));
    }

    public function find(int $userId, string $id, bool $lock = false): FollowUp
    {
        $q = FollowUp::where('user_id', $userId)->whereKey($id);
        $row = ($lock ? $q->lockForUpdate() : $q)->first();
        if (!$row) ApiError::throw(404, 'followup_not_found', 'That follow-up does not exist.');
        return $row;
    }

    public function list(int $userId, ?string $agentId): array
    {
        return FollowUp::where('user_id', $userId)->when($agentId, fn ($q) => $q->where('agent_id', $agentId))
            ->orderByDesc('created_at')->limit(100)->get()->map(fn ($f) => $this->payload($f))->all();
    }

    public function control(int $userId, string $id, int $revision, string $action): array
    {
        return DB::transaction(function () use ($userId, $id, $revision, $action) {
            $row = $this->find($userId, $id, true);
            if ($row->revision !== $revision) ApiError::throw(409, 'work_changed', 'This follow-up changed. Refresh it before deciding.');
            abort_unless(in_array($action, ['pause', 'resume', 'cancel'], true), 422, 'Choose pause, resume or cancel.');
            if (in_array($row->status, ['completed', 'cancelled', 'expired', 'satisfied'], true)) ApiError::throw(409, 'work_terminal', 'This follow-up is finished.');
            if ($action === 'resume') {
                Activations::enabled();
                abort_unless($row->status === 'paused' && $row->expires_at->isFuture(), 409, 'Only an unexpired paused follow-up can resume.');
                RuntimePins::require($userId, $row->runtime_snapshot);
            }
            if ($action === 'pause') abort_unless(in_array($row->status, ['active', 'paused'], true), 409, 'An admitted or blocked follow-up cannot be paused.');
            if ($action === 'cancel') $this->cancelTask($row);
            $row->forceFill(['status' => match ($action) { 'pause' => 'paused', 'resume' => 'active', default => 'cancelled' },
                'reason' => null, 'revision' => $row->revision + 1])->save();
            return $this->payload($row);
        });
    }

    public function cancelTask(FollowUp $row): void
    {
        $run = $row->run_id ? Run::whereKey($row->run_id)->where('user_id', $row->user_id)->first() : null;
        if ($run && !RunStates::terminal($run->state)) app(Runs::class)->cancel($row->user_id, $run->id);
    }

    public function payload(FollowUp $row): array
    {
        return ['id' => $row->id, 'agentId' => $row->agent_id, 'title' => $row->title, 'revision' => $row->revision,
            'status' => $row->status, 'reason' => $row->reason, 'runtimeId' => $row->runtime_binding_id, 'runtime' => $row->runtime_snapshot,
            'expiresAt' => $row->expires_at->toIso8601String(), 'createdAt' => $row->created_at?->toIso8601String(),
            'updatedAt' => $row->updated_at?->toIso8601String(), 'prompt' => $row->prompt, 'condition' => $row->condition,
            'runId' => $row->run_id, 'eventId' => $row->event_id,
            'evidence' => Evidence::from($row->run_id ? Run::find($row->run_id) : null, (int) $row->user_id, $row->agent_id)];
    }
}
