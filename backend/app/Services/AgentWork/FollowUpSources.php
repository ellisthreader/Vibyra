<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Trigger};
use App\Services\AgentRuns\{ApiError, Grants};
use Illuminate\Support\Facades\DB;

final class FollowUpSources
{
    public function source(int $userId, string $agentId, array $condition, bool $lock = false): Trigger
    {
        $q = Trigger::where('user_id', $userId)->where('agent_id', $agentId)->whereKey($condition['triggerId']);
        $trigger = ($lock ? $q->lockForUpdate() : $q)->first();
        if (!$trigger) ApiError::throw(404, 'followup_source_missing', 'Choose an event source belonging to this teammate.');
        if ($trigger->revision !== $condition['triggerRevision']) ApiError::throw(409, 'followup_source_changed', 'That event source changed. Review a new follow-up.');
        if (FollowUpAuthority::snapshot($trigger, $lock) === null) ApiError::throw(409, 'followup_source_unhealthy', 'That event source is not ready.');
        if ($reason = $this->refusal($trigger)) ApiError::throw(409, $reason, 'That event source is not ready.');
        return $trigger;
    }

    public function refusal(Trigger $trigger): ?string
    {
        if ($trigger->deleted_at) return 'followup_source_deleted';
        if ($trigger->paused_at) return 'followup_source_paused';
        if ($trigger->last_error) return 'followup_source_unhealthy';
        if (FollowUpAuthority::snapshot($trigger) === null) return 'followup_source_unhealthy';
        return null;
    }

    public function subjects(Trigger $trigger): array
    {
        $hash = FollowUpAuthority::hash(FollowUpAuthority::snapshot($trigger));
        if (!$hash) return [];
        return DB::table('agent_work_signals')->where('trigger_id', $trigger->id)->where('user_id', $trigger->user_id)
            ->where('trigger_revision', $trigger->revision)->where('authority_hash', $hash)->orderByDesc('id')->limit(100)
            ->pluck('subject')->unique()->values()->map(fn ($s) => ['subject' => $s, 'label' => $s])->all();
    }

    public function list(int $userId, string $agentId): array
    {
        app(Grants::class)->agent($userId, $agentId);
        return Trigger::where('user_id', $userId)->where('agent_id', $agentId)->whereNull('deleted_at')
            ->orderBy('created_at')->limit(50)->get()->map(fn ($t) => ['triggerId' => $t->id, 'triggerRevision' => $t->revision,
                'kind' => $t->kind, 'title' => $t->kind, 'healthy' => $this->refusal($t) === null, 'subjects' => $this->subjects($t)])->all();
    }
}
