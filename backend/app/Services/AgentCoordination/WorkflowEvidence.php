<?php
namespace App\Services\AgentCoordination;
use App\Models\AgentCoordination\Workflow;
use App\Models\AgentV2\Run;
use App\Services\AgentWork\{Evidence, RuntimePins, SkillSnapshots};
final class WorkflowEvidence
{
    public static function for(Workflow $w, ?string $runId, string $agentId): ?array
    {
        if (!$runId) return null; $r = Run::where('user_id', $w->user_id)->whereKey($runId)->first();
        $pin = MemberPins::one($w->member_snapshots, $agentId);
        if (!$r || !RuntimePins::same($w->runtime_snapshot, $r->runtime_snapshot) || (int) $r->profile_revision !== $pin['profileRevision']
            || !hash_equals($pin['skillsHash'], SkillSnapshots::runHash($r))) return null;
        return Evidence::from($r, $w->user_id, $agentId);
    }
}
