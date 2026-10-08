<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentRuns\{ApiError, Canonical};
use Illuminate\Support\Facades\{Crypt, DB};

/** A task uses exactly the assigned skill versions present when it was admitted. */
final class SkillSnapshots
{
    public static function selection(int $userId, string $agentId): array
    {
        return DB::table('agent_skills')->join('agent_skill_assignments', 'agent_skills.id', '=', 'agent_skill_assignments.skill_id')
            ->where('agent_skills.user_id', $userId)->where('agent_skill_assignments.agent_id', $agentId)
            ->orderBy('agent_skills.id')->limit(20)->get(['agent_skills.id', 'agent_skills.name', 'agent_skills.instructions', 'agent_skills.revision'])
            ->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'instructions' => $s->instructions, 'revision' => (int) $s->revision])->all();
    }

    public static function selectionHash(int $userId, string $agentId): string
    {
        return Canonical::hash(self::selection($userId, $agentId));
    }

    /** Admission already holds this teammate's row, serializing assignment commits. */
    public static function capture(Run $run): void
    {
        if (!config('agents_v2.work_enabled')) return;
        $skills = self::selection($run->user_id, $run->agent_id);
        $binding = RuntimeBinding::find($run->runtime_binding_id);
        if ($skills !== [] && (($run->runtime_snapshot['capabilities']['pinnedSkillsV1'] ?? false) !== true
            || ($binding?->capabilities['pinnedSkillsV1'] ?? false) !== true)) self::unsupported();
        DB::table('agent_run_skill_snapshots')->insert(['run_id' => $run->id, 'user_id' => $run->user_id,
            'skills' => Crypt::encryptString(Canonical::json($skills)), 'created_at' => now()]);
    }

    public static function forRun(Run $run): array { return self::stored((int) $run->user_id, $run->id); }

    /** Empty or pre-Stage4 runs never acquire new instructions or need this new capability. */
    public static function supports(RuntimeBinding $binding, Run $run): bool
    {
        return ($binding->capabilities['pinnedSkillsV1'] ?? false) === true || self::forRun($run) === [];
    }

    /** Before the run lock: registration cannot replace the executor while this mutation proceeds. */
    public static function fenceBinding(RuntimeBinding $binding, string $runId): void
    {
        if (self::stored((int) $binding->user_id, $runId) === []) return;
        $fresh = RuntimeBinding::whereKey($binding->id)->where('user_id', $binding->user_id)->lockForUpdate()->first();
        if (!$fresh || $fresh->revoked_at || ($fresh->capabilities['pinnedSkillsV1'] ?? false) !== true
            || !hash_equals($fresh->runner_key_hash, $binding->runner_key_hash)) self::unsupported();
    }

    private static function stored(int $userId, string $runId): array
    {
        $saved = DB::table('agent_run_skill_snapshots')->where('run_id', $runId)->where('user_id', $userId)->value('skills');
        return $saved ? json_decode(Crypt::decryptString($saved), true, 32, JSON_THROW_ON_ERROR) : [];
    }

    private static function unsupported(): never
    {
        ApiError::throw(409, 'runtime_skills_unsupported', 'Update or reconnect the selected computer before running assigned skills, then retry.');
    }

    public static function runHash(Run $run): string { return Canonical::hash(self::forRun($run)); }
}
