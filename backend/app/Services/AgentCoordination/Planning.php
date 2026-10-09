<?php
namespace App\Services\AgentCoordination;
use App\Models\AgentCoordination\Message;
use App\Services\AgentRuns\{Admission, ApiError, Canonical, Runs};
use App\Services\AgentRuns\Tools\Providers\Schema;
use App\Services\AgentWork\RuntimePins;
use Illuminate\Support\Facades\{DB, Validator};
final class Planning
{
    public function send(int $userId, string $groupId, array $data): array
    {
        Gate::require($userId);
        Schema::only($data, ['expectedRevision', 'expectedRuntimeRevision', 'runtimeId', 'idempotencyKey', 'prompt', 'mentions', 'sharedContext']);
        $d = Validator::make($data, ['expectedRevision' => 'required|integer|min:1', 'expectedRuntimeRevision' => 'required|integer|min:1', 'runtimeId' => 'required|uuid',
            'idempotencyKey' => 'required|string|max:120', 'prompt' => 'required|string|max:4000',
            'mentions' => 'present|array|max:8', 'mentions.*' => 'required|uuid|distinct', 'sharedContext' => 'required|array'])->validate();
        abort_if(trim($d['prompt']) === '' || !array_is_list($d['mentions']), 422);
        $d['sharedContext'] = SharedContext::normalize($d['sharedContext']); $hash = Canonical::hash([$groupId, $d]);
        return DB::transaction(function () use ($userId, $groupId, $d, $hash) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            DB::table('users')->where('id', $userId)->lockForUpdate()->firstOrFail();
            if ($old = Message::where('user_id', $userId)->where('idempotency_key', $d['idempotencyKey'])->first()) {
                if (!hash_equals($old->request_hash, $hash)) ApiError::throw(409, 'idempotency_conflict', 'That request ID already names another message.');
                return $this->receipt($old);
            }
            $group = app(Groups::class)->find($userId, $groupId, true); Gate::revision($group->revision, $d['expectedRevision']);
            abort_if($group->deleted_at || array_diff($d['mentions'], array_column($group->members, 'agentId')), 409, 'Refresh the group membership.');
            $runtime = RuntimePins::capture($userId, $d['runtimeId']);
            if (($runtime['revision'] ?? null) !== (int) $d['expectedRuntimeRevision']) ApiError::throw(409, 'runtime_changed', 'The reviewed computer or AI account changed. Refresh before sending.');
            $members = MemberPins::capture($userId, $group->members); $context = SharedContext::capture($userId, $d['sharedContext']);
            $message = Message::create(['user_id' => $userId, 'group_id' => $groupId, 'group_revision' => $group->revision,
                'coordinator_id' => $group->coordinator_id, 'idempotency_key' => $d['idempotencyKey'], 'request_hash' => $hash,
                'prompt' => $d['prompt'], 'mentions' => $d['mentions'], 'runtime_binding_id' => $d['runtimeId'],
                'runtime_snapshot' => [...$runtime, 'groupName' => $group->name], 'member_snapshots' => $members, 'shared_context' => $context]);
            $prompt = $d['prompt']."\n\nPlan a bounded coordinated workflow. Only propose_work context/workflow is available; do not execute the requested work yet. "
                ."Use 1–12 steps, explicit successCriteria, earlier-step dependencies, finalCriteria, and an expiry within seven days. "
                ."Only use these teammate IDs: ".Canonical::json(array_values(array_filter($members, fn ($m) => !$d['mentions'] || in_array($m['agentId'], $d['mentions'], true))))
                .SharedContext::prompt($context);
            [$run] = app(Admission::class)->admit($userId, ['agentId' => $group->coordinator_id, 'runtimeId' => $d['runtimeId'],
                'prompt' => $prompt, 'attachments' => [], 'idempotencyKey' => 'group-plan:'.$message->id, 'executionMode' => 'coordinated']);
            Context::attach($run, $message, null, 'planning');
            $message->forceFill(['planning_run_id' => $run->id])->save(); return $this->receipt($message);
        });
    }
    public function list(int $userId, string $groupId, ?string $key = null): array
    {
        app(Groups::class)->find($userId, $groupId);
        return Message::where('user_id', $userId)->where('group_id', $groupId)->when($key !== null, fn ($q) => $q->where('idempotency_key', $key))
            ->latest()->limit(50)->get()->map(fn ($m) => $this->payload($m))->all();
    }
    public function payload(Message $m): array
    {
        return ['id' => $m->id, 'groupId' => $m->group_id, 'groupRevision' => $m->group_revision, 'coordinatorId' => $m->coordinator_id, 'prompt' => $m->prompt,
            'mentions' => $m->mentions, 'sharedContext' => SharedContext::public($m->shared_context), 'runtime' => $m->runtime_snapshot,
            'createdAt' => $m->created_at->toIso8601String(), 'planningRunId' => $m->planning_run_id];
    }
    private function receipt(Message $m): array
    {
        return ['message' => $this->payload($m), 'run' => app(Runs::class)->payload(app(Runs::class)->find($m->user_id, $m->planning_run_id))];
    }
}
