<?php
namespace App\Services\AgentCoordination;
use App\Models\AgentCoordination\{Message, Workflow};
use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentRuns\ApiError;
use App\Services\AgentWork\{RuntimePins, SkillSnapshots};
use Illuminate\Support\Facades\DB;
final class Context
{
    public static function attach(Run $run, Message $message, ?Workflow $workflow, string $role, ?string $key = null): void
    {
        $pin = MemberPins::one($message->member_snapshots, $run->agent_id);
        if ((int) $run->profile_revision !== $pin['profileRevision'] || !hash_equals($pin['skillsHash'], SkillSnapshots::runHash($run))
            || !RuntimePins::same($message->runtime_snapshot, $run->runtime_snapshot))
            ApiError::throw(409, 'workflow_selection_changed', 'The reviewed teammate or account changed during admission.');
        DB::table('agent_coordination_runs')->insertOrIgnore(['run_id' => $run->id, 'user_id' => $run->user_id,
            'group_id' => $message->group_id, 'group_revision' => $message->group_revision, 'message_id' => $message->id,
            'workflow_id' => $workflow?->id, 'step_key' => $key, 'role' => $role, 'created_at' => now()]);
    }
    public static function isolated(Run $run): bool { return self::mapping($run) !== null; }
    private static function mapping(Run $run): ?object
    {
        return DB::table('agent_coordination_runs')->where('user_id', $run->user_id)->where('run_id', $run->id)->first();
    }
    public static function metadata(Run $run): array
    {
        $m = self::mapping($run);
        return $m ? ['groupId' => $m->group_id, 'groupRevision' => (int) $m->group_revision, 'messageId' => $m->message_id,
            'workflowId' => $m->workflow_id, 'nodeKey' => $m->step_key, 'role' => $m->role] : [];
    }
    /** Call before binding/run locks; lock order group > workflow > binding > profiles > run. */
    public static function fence(RuntimeBinding $binding, string $runId, bool $receiptOnly = false): void
    {
        $map = DB::table('agent_coordination_runs')->where('run_id', $runId)->first();
        if (!$map) return;
        abort_unless((int) $map->user_id === (int) $binding->user_id, 409);
        if ($receiptOnly) {
            $m = Message::where('user_id', $binding->user_id)->whereKey($map->message_id)->firstOrFail();
            abort_unless(RuntimePins::same($m->runtime_snapshot, \App\Services\AgentRuns\RuntimeBindings::snapshot($binding)), 409);
            return; // Generation and action claimed-generation remain fenced by the caller; never authorizes a dispatch.
        }
        Gate::require($binding->user_id);
        $g = app(Groups::class)->find($binding->user_id, $map->group_id, true);
        abort_if($g->deleted_at || $g->revision !== (int) $map->group_revision, 409, 'Reviewed group membership changed.');
        if ($map->workflow_id) {
            $w = Workflow::where('user_id', $binding->user_id)->whereKey($map->workflow_id)->lockForUpdate()->first();
            abort_unless($w && in_array($w->status, ['active', 'paused', 'synthesizing']) && $w->expires_at->isFuture(), 409, 'The workflow is no longer running.');
        }
        $message = Message::where('user_id', $binding->user_id)->whereKey($map->message_id)->firstOrFail();
        // Cloud runtime registration locks workspace before binding; preserve that order before RuntimePins takes the binding.
        app(\App\Services\AgentRuns\Cloud\Authority::class)->check($binding);
        RuntimePins::require($binding->user_id, $message->runtime_snapshot);
        abort_unless(RuntimePins::same($message->runtime_snapshot, \App\Services\AgentRuns\RuntimeBindings::snapshot($binding)), 409);
        MemberPins::require($binding->user_id, $message->member_snapshots);
    }
    public static function filterTools(Run $run, array $entries): array
    {
        if (!self::isolated($run)) return $entries;
        return array_values(array_filter($entries, fn ($entry) => self::toolAllowed($run, $entry['name'] ?? $entry['tool'] ?? '', [])));
    }
    private static function toolAllowed(Run $run, string $tool, array $arguments): bool
    {
        $map = self::mapping($run); if (!$map) return true;
        if ($map->role === 'planning') return $tool === 'propose_work' && (!isset($arguments['kind']) || in_array($arguments['kind'], ['context', 'workflow'], true));
        return !in_array($tool, ['propose_work', 'delegate_task', 'read_output', 'cloud_read_file', 'cloud_write_file'], true)
            && !($tool === 'save_output' && isset($arguments['id']));
    }
    public static function authorizeTool(Run $run, array $call): void
    {
        if (!self::toolAllowed($run, $call['tool'] ?? $call['name'] ?? '', $call['arguments'] ?? []))
            ApiError::throw(403, 'workflow_tool_scope', 'That tool is outside this reviewed group task.');
    }
    public static function afterRun(Run $run): void
    {
        $map = self::mapping($run);
        if ($map?->workflow_id) DB::afterCommit(function () use ($map) {
            try { app(WorkflowProgress::class)->advance($map->workflow_id); } catch (\Throwable $e) { report($e); }
        });
    }
}
