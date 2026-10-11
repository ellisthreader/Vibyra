<?php
use App\Models\{OrganizationMember, User};
use App\Services\Teams\Organizations;
final class ConcOrganisationOps
{
    public static function setup(): void
    {
        config(['teams.enabled' => true, 'teams.plan_gate' => false, 'agents_v2.organisation_enabled' => true]);
    }
    public static function run(array $a): array
    {
        self::setup();
        if (($a['mode'] ?? '') === 'remove') {
            app(Organizations::class)->remove(User::findOrFail($a['owner']), $a['seat']);
            return ['status' => 200, 'json' => []];
        }
        if (($a['mode'] ?? '') === 'downgrade') {
            app(Organizations::class)->changeRole(User::findOrFail($a['owner']), $a['seat'], 'member');
            return ['status' => 200, 'json' => []];
        }
        return ConcHttp::call($a['method'], $a['uri'], $a['token'], $a['json'] ?? [], [],
            $a['method'] === 'DELETE' ? json_encode($a['json'] ?? []) : null);
    }
}
