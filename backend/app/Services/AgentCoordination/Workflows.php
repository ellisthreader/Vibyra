<?php
namespace App\Services\AgentCoordination;
use App\Models\AgentCoordination\{Message, Workflow};
use App\Services\AgentRuns\{ApiError, Canonical};
use App\Services\AgentWork\RuntimePins;
use Illuminate\Support\Facades\DB;
final class Workflows
{
    public function activate(int $userId, array $spec, string $key): array
    {
        Gate::require($userId); $s = WorkflowSpecs::normalize($spec); $hash = Canonical::hash($s);
        $w = DB::transaction(function () use ($userId, $s, $key, $hash) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            DB::table('users')->where('id', $userId)->lockForUpdate()->firstOrFail();
            if ($old = Workflow::where('user_id', $userId)->where('activation_key', $key)->first()) {
                if (!hash_equals($old->spec_hash, $hash)) ApiError::throw(409, 'idempotency_conflict', 'That acceptance ID names another plan.');
                return $old;
            }
            WorkflowDraft::lockSource($userId, $s);
            $m = Message::where('user_id', $userId)->whereKey($s['messageId'])->firstOrFail();
            $source = WorkflowDraft::bind(\App\Models\AgentV2\Run::findOrFail($m->planning_run_id), array_intersect_key($s, array_flip(['title', 'expiresAt', 'steps', 'finalCriteria'])));
            foreach (['groupId', 'groupRevision', 'messageId', 'prompt', 'mentions', 'sharedContext'] as $field)
                abort_unless(Canonical::hash($source[$field]) === Canonical::hash($s[$field]), 409, 'The reviewed source context changed.');
            abort_unless($s['agentId'] === $m->coordinator_id && $s['runtimeId'] === $m->runtime_binding_id, 409);
            abort_unless(\Carbon\CarbonImmutable::parse($s['expiresAt'])->isFuture(), 422, 'Choose a future expiry.');
            RuntimePins::require($userId, $m->runtime_snapshot); MemberPins::require($userId, $m->member_snapshots);
            $allowed = $m->mentions ?: array_column($m->member_snapshots, 'agentId');
            $steps = array_map(function ($step) use ($m, $allowed) {
                abort_unless(in_array($step['agentId'], $allowed, true), 422, 'Steps may only use the selected teammates.');
                return [...$step, 'handle' => MemberPins::one($m->member_snapshots, $step['agentId'])['handle'], 'status' => 'pending', 'runId' => null, 'evidence' => null, 'reason' => null];
            }, $s['steps']);
            return Workflow::create(['user_id' => $userId, 'group_id' => $m->group_id, 'group_revision' => $m->group_revision,
                'message_id' => $m->id, 'coordinator_id' => $m->coordinator_id, 'activation_key' => $key, 'spec_hash' => $hash,
                'title' => $s['title'], 'prompt' => $m->prompt, 'runtime_binding_id' => $m->runtime_binding_id, 'runtime_snapshot' => $m->runtime_snapshot,
                'member_snapshots' => $m->member_snapshots, 'shared_context' => $m->shared_context, 'mentions' => $m->mentions,
                'steps' => $steps, 'final_criteria' => $s['finalCriteria'], 'expires_at' => $s['expiresAt']]);
        });
        DB::afterCommit(fn () => app(WorkflowProgress::class)->advance($w->id));
        return $this->payload($w->fresh());
    }
    public function find(int $userId, string $id): Workflow
    {
        $w = Workflow::where('user_id', $userId)->whereKey($id)->first();
        if (!$w) ApiError::throw(404, 'workflow_not_found', 'That workflow does not exist.'); return $w;
    }
    public function page(int $userId, string $groupId, int $limit = 20, ?string $cursor = null): array
    {
        app(Groups::class)->find($userId, $groupId); $limit = max(1, min(50, $limit));
        $q = Workflow::where('user_id', $userId)->where('group_id', $groupId);
        if ($cursor) {
            $a = (clone $q)->whereKey($cursor)->first(); abort_unless($a, 422, 'Refresh this workflow page.');
            $q->where(fn ($q) => $q->where('created_at', '<', $a->created_at)->orWhere(fn ($q) => $q->where('created_at', $a->created_at)->where('id', '<', $a->id)));
        }
        $rows = $q->orderByDesc('created_at')->orderByDesc('id')->limit($limit + 1)->get(); $page = $rows->take($limit);
        return ['workflows' => $page->map(fn ($w) => $this->payload($w))->all(), 'nextCursor' => $rows->count() > $limit ? $page->last()->id : null];
    }
    public function control(int $userId, string $id, int $revision, string $action): array
    {
        abort_unless(in_array($action, ['pause', 'resume', 'cancel']), 422);
        $w = $this->find($userId, $id);
        DB::transaction(function () use ($w, $revision, $action) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($w->user_id);
            app(Groups::class)->find($w->user_id, $w->group_id, true);
            $w = Workflow::whereKey($w->id)->lockForUpdate()->firstOrFail(); Gate::revision($w->revision, $revision);
            abort_if(in_array($w->status, ['completed', 'cancelled', 'expired']), 409, 'That workflow already ended.');
            if ($action === 'cancel') { WorkflowProgress::cancelRuns($w); $w->status = 'cancelled'; }
            elseif ($action === 'pause') { abort_unless(in_array($w->status, ['active', 'synthesizing']), 409); $w->status = 'paused'; }
            else { abort_unless($w->status === 'paused', 409); WorkflowProgress::authority($w); $w->status = $w->final_run_id ? 'synthesizing' : 'active'; }
            $w->revision++; $w->save();
        });
        if ($action === 'resume') app(WorkflowProgress::class)->advance($id);
        return $this->payload($w->fresh());
    }
    public function confirm(int $userId, string $id, int $revision): array
    {
        $w = $this->find($userId, $id);
        DB::transaction(function () use ($w, $revision) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($w->user_id);
            app(Groups::class)->find($w->user_id, $w->group_id, true);
            $w = Workflow::whereKey($w->id)->lockForUpdate()->firstOrFail(); Gate::revision($w->revision, $revision);
            abort_unless($w->status === 'awaiting_review', 409); WorkflowProgress::authority($w);
            foreach ($w->steps as $s) abort_unless(WorkflowEvidence::for($w, $s['runId'], $s['agentId']), 409, 'Task evidence is missing.');
            abort_unless(WorkflowEvidence::for($w, $w->final_run_id, $w->coordinator_id), 409, 'Final evidence is missing.');
            $w->forceFill(['status' => 'completed', 'revision' => $w->revision + 1])->save();
        }); return $this->payload($w->fresh());
    }
    public function payload(Workflow $w): array
    {
        $final = WorkflowEvidence::for($w, $w->final_run_id, $w->coordinator_id);
        return ['id' => $w->id, 'groupId' => $w->group_id, 'groupRevision' => $w->group_revision, 'coordinatorId' => $w->coordinator_id, 'messageId' => $w->message_id,
            'title' => $w->title, 'prompt' => $w->prompt, 'revision' => $w->revision, 'status' => $w->status, 'reason' => $w->reason,
            'runtimeId' => $w->runtime_binding_id, 'runtime' => $w->runtime_snapshot, 'members' => array_map(function ($m) { unset($m['skillsHash']); return $m; }, $w->member_snapshots),
            'mentions' => $w->mentions, 'sharedContext' => SharedContext::public($w->shared_context), 'expiresAt' => $w->expires_at->toIso8601String(),
            'createdAt' => $w->created_at->toIso8601String(), 'updatedAt' => $w->updated_at->toIso8601String(), 'steps' => $w->steps,
            'finalCriteria' => $w->final_criteria, 'finalRunId' => $w->final_run_id, 'finalAnswer' => $final['answer'] ?? null, 'finalEvidence' => $final,
            'progress' => ['delivered' => count(array_filter($w->steps, fn ($s) => $s['status'] === 'delivered')), 'total' => count($w->steps)]];
    }
}
