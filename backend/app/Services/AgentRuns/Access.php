<?php

namespace App\Services\AgentRuns;

/** Agent V2 is behind `AGENTS_V2_ENABLED` plus a per-user cohort (`AGENTS_V2_USER_IDS`). */
final class Access
{
    public function allows(int $userId): bool
    {
        if (!config('agents_v2.enabled')) return false;
        $list = trim((string) config('agents_v2.user_ids', ''));
        if ($list === '*') return true;
        $ids = array_map('intval', array_filter(array_map('trim', explode(',', $list)), 'is_numeric'));
        return in_array($userId, $ids, true);
    }

    public function require(int $userId): void
    {
        if (!config('agents_v2.enabled')) ApiError::throw(503, 'agents_v2_disabled', 'Agent V2 is not enabled.');
        if (!$this->allows($userId)) ApiError::throw(403, 'not_in_cohort', 'Agent V2 is not available for this account yet.');
    }
}
