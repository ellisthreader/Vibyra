<?php
namespace App\Services\AgentCoordination;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentWork\SkillSnapshots;
use Illuminate\Support\Facades\DB;
final class MemberPins
{
    /** Runtime precedes sorted teammate rows; snapshots never include private memory/history. */
    public static function capture(int $userId, array $members, bool $lock = true): array
    {
        $ids = array_column($members, 'agentId'); sort($ids);
        $q = DB::table('agent_teammates')->where('user_id', $userId)->whereIn('id', $ids)->whereNull('archived_at')->orderBy('id');
        $agents = ($lock ? $q->lockForUpdate() : $q)->get()->keyBy('id');
        if ($agents->count() !== count($ids)) ApiError::throw(409, 'group_member_unavailable', 'Choose active teammates belonging to this account.');
        return array_map(fn ($m) => ['agentId' => $m['agentId'], 'handle' => $m['handle'], 'name' => $agents[$m['agentId']]->name,
            'profileRevision' => (int) $agents[$m['agentId']]->revision, 'skillsHash' => SkillSnapshots::selectionHash($userId, $m['agentId'])], $members);
    }
    public static function require(int $userId, array $pins): void
    {
        $current = self::capture($userId, $pins);
        foreach ($pins as $i => $pin) if ($pin['profileRevision'] !== $current[$i]['profileRevision']
            || !hash_equals($pin['skillsHash'], $current[$i]['skillsHash']))
            ApiError::throw(409, 'group_member_changed', 'A reviewed teammate profile or skill changed. Review a new workflow.');
    }
    public static function one(array $pins, string $agentId): array
    {
        foreach ($pins as $pin) if ($pin['agentId'] === $agentId) return $pin;
        ApiError::throw(409, 'group_member_unavailable', 'That teammate is not part of this reviewed workflow.');
    }
}
