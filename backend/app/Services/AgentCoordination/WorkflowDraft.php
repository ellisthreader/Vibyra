<?php
namespace App\Services\AgentCoordination;
use App\Models\AgentCoordination\Message;
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{ApiError, Canonical};
use App\Services\AgentRuns\Tools\Providers\Schema;
final class WorkflowDraft
{
    private const SOURCE = ['groupId', 'groupRevision', 'messageId', 'prompt', 'mentions', 'sharedContext'];
    public static function source(Run $run): Message
    {
        $m = Message::where('user_id', $run->user_id)->where('planning_run_id', $run->id)->first();
        if (!$m || $m->coordinator_id !== $run->agent_id) ApiError::throw(409, 'workflow_planning_required', 'Start a reviewed group message to plan a workflow.');
        return $m;
    }
    public static function bind(Run $run, array $spec): array
    {
        Schema::only($spec, ['title', 'expiresAt', 'steps', 'finalCriteria']); $m = self::source($run);
        return [...$spec, 'groupId' => $m->group_id, 'groupRevision' => $m->group_revision, 'messageId' => $m->id,
            'prompt' => $m->prompt, 'mentions' => $m->mentions, 'sharedContext' => SharedContext::public($m->shared_context)];
    }
    public static function edit($proposal, array $spec): array
    {
        foreach (self::SOURCE as $key) if (Canonical::hash($spec[$key] ?? null) !== Canonical::hash($proposal->spec[$key] ?? null))
            ApiError::throw(409, 'workflow_context_changed', 'Start a new group message to change shared context or membership.');
        return $spec;
    }
    public static function lockSource(int $userId, array $spec): void
    {
        $g = app(Groups::class)->find($userId, $spec['groupId'], true);
        Gate::revision($g->revision, $spec['groupRevision']); abort_if($g->deleted_at, 409, 'The group was removed.');
    }
    public static function reviewContext(Run $run): array
    {
        $m = self::source($run);
        return ['groupId' => $m->group_id, 'groupName' => $m->runtime_snapshot['groupName'], 'groupRevision' => $m->group_revision,
            'messageId' => $m->id, 'members' => array_map(function ($pin) { unset($pin['skillsHash']); return $pin; }, $m->member_snapshots),
            'mentions' => $m->mentions, 'sharedContext' => SharedContext::public($m->shared_context)];
    }
}
