<?php
namespace App\Services\AgentOrganizations;
use App\Services\AgentRuns\{ApiError, Canonical};
use Illuminate\Support\Facades\DB;
final class Definitions
{
    public static function find(string $org, string $id): object
    {
        return DB::table('agent_organisation_definitions')->where('organization_id', $org)->where('id', $id)->first()
            ?? ApiError::throw(404, 'organisation_agent_missing', 'That organisation Agent is unavailable.');
    }
    public static function version(string $id, int $revision): object
    {
        return DB::table('agent_organisation_versions')->where('definition_id', $id)->where('revision', $revision)->first()
            ?? ApiError::throw(409, 'organisation_version_missing', 'The reviewed organisation Agent is unavailable.');
    }
    public static function payload(object $d, int $user, ?int $seatId = null): array
    {
        $v = self::version($d->id, $d->revision);
        $i = DB::table('agent_organisation_instances')->where('definition_id', $d->id)->where('user_id', $user)
            ->where('member_id', $seatId)->first();
        return ['id' => $d->id, 'name' => $v->name, 'avatar' => $v->avatar, 'instructions' => $v->instructions,
            'knowledge' => $v->knowledge, 'revision' => (int) $d->revision, 'reviewHash' => $v->review_hash,
            'retired' => $d->retired_at !== null, 'updatedAt' => \Illuminate\Support\Carbon::parse($d->updated_at)->toIso8601String(),
            'instanceAgentId' => $i?->agent_id, 'instanceRevision' => $i ? (int) $i->revision : null];
    }
    public static function save(int $user, string $id, array $data): array
    {
        return DB::transaction(function () use ($user, $id, $data) {
            $seat = Gate::member($user, true, 'manager'); $org = $seat->organization_id;
            $d = DB::table('agent_organisation_definitions')->where('id', $id)->first();
            if ($d && $d->organization_id !== $org) ApiError::throw(404, 'organisation_agent_missing', 'That organisation Agent is unavailable.');
            $body = ['name' => trim($data['name']), 'avatar' => $data['avatar'],
                'instructions' => trim($data['instructions']), 'knowledge' => trim($data['knowledge'] ?? '')];
            if ($body['name'] === '' || $body['instructions'] === '') ApiError::throw(422, 'organisation_agent_invalid', 'Enter a name and instructions.');
            $hash = Canonical::hash($body); $expected = (int) $data['expectedRevision'];
            if ($d && !$d->retired_at && (int) $d->revision === $expected + 1
                && hash_equals(self::version($id, $d->revision)->review_hash, $hash)) return self::payload($d, $user, $seat->id);
            if ((int) ($d?->revision ?? 0) !== $expected || $d?->retired_at)
                ApiError::throw(409, 'organisation_agent_changed', 'Reload the current published Agent before reviewing a change.');
            if (!$d && DB::table('agent_organisation_definitions')->where('organization_id', $org)->whereNull('retired_at')->count() >= 50)
                ApiError::throw(422, 'organisation_agent_limit', 'Retire an Agent before publishing another.');
            DB::table('agent_organisation_definitions')->updateOrInsert(['id' => $id], ['organization_id' => $org,
                'revision' => $expected + 1, 'updated_at' => now(), 'created_at' => $d?->created_at ?? now()]);
            DB::table('agent_organisation_versions')->insert(['definition_id' => $id, 'revision' => $expected + 1,
                ...$body, 'review_hash' => $hash, 'author_id' => $user, 'created_at' => now()]);
            Audit::record($org, $user, 'definition.published', $id, $expected + 1);
            return self::payload(self::find($org, $id), $user, $seat->id);
        });
    }
    public static function retire(int $user, string $id, int $expected): array
    {
        return DB::transaction(function () use ($user, $id, $expected) {
            $seat = Gate::member($user, true, 'manager'); $d = self::find($seat->organization_id, $id);
            if ((int) $d->revision !== $expected) ApiError::throw(409, 'organisation_agent_changed', 'Reload this Agent before retiring it.');
            if (!$d->retired_at) {
                DB::table('agent_organisation_definitions')->where('id', $id)->update(['retired_at' => now(), 'updated_at' => now()]);
                Audit::record($seat->organization_id, $user, 'definition.retired', $id, $expected);
            }
            return self::payload(self::find($seat->organization_id, $id), $user, $seat->id);
        });
    }
}
