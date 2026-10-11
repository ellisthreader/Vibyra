<?php
namespace App\Services\AgentRuns\Browser;
use App\Services\AgentRuns\{ApiError, Canonical};
use App\Services\AgentRuns\Jobs\AccountLock;
use Illuminate\Support\Facades\DB;
/** Persistent revision survives revocation: stale first-create requests cannot resurrect access. */
final class BrowserAccessVersion
{
    public static function revision(int $userId, string $agentId): int
    {
        return (int) DB::table('agent_browser_access_versions')->where('user_id', $userId)->where('agent_id', $agentId)->value('revision');
    }
    public static function begin(int $userId, string $agentId, ?array $expected, ?array $current, array $operation): bool
    {
        AccountLock::force($userId);
        DB::table('agent_browser_access_versions')->insertOrIgnore(['user_id' => $userId, 'agent_id' => $agentId, 'revision' => 0]);
        $row = DB::table('agent_browser_access_versions')->where('user_id', $userId)->where('agent_id', $agentId)->lockForUpdate()->first();
        $hash = Canonical::hash([$expected, $operation]);
        if ($expected && $row->request_hash === $hash) return false;
        if ($expected && ((int) $row->revision !== $expected['expectedRevision']
            || ($current['connectionId'] ?? null) !== $expected['expectedConnectionId']
            || ($current['generation'] ?? 0) !== $expected['expectedGeneration']))
            ApiError::throw(409, 'browser_access_changed', 'Browser access changed. Reload and review its current sites.');
        DB::table('agent_browser_access_versions')->where('user_id', $userId)->where('agent_id', $agentId)
            ->update(['revision' => (int) $row->revision + 1, 'request_hash' => $hash]);
        return true;
    }
}
