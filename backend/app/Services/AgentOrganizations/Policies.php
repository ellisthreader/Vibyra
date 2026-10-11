<?php
namespace App\Services\AgentOrganizations;
use App\Services\AgentRuns\{ApiError, Canonical};
use Illuminate\Support\Facades\DB;
final class Policies
{
    public const EXECUTION = 'member_account_stop_on_offboarding';
    public static function get(string $org): object
    {
        return DB::table('agent_organisation_policies')->where('organization_id', $org)->first()
            ?? (object) ['organization_id' => $org, 'revision' => 0, 'enabled' => false,
                'allowed_providers' => '[]', 'daily_task_limit' => 25, 'retention_days' => 90, 'request_hash' => null];
    }
    public static function payload(object $p): array
    {
        return ['revision' => (int) $p->revision, 'enabled' => (bool) $p->enabled,
            'allowedProviders' => json_decode($p->allowed_providers, true), 'dailyTaskLimit' => (int) $p->daily_task_limit,
            'retentionDays' => (int) $p->retention_days, 'executionPolicy' => self::EXECUTION];
    }
    public static function save(int $user, array $data): array
    {
        return DB::transaction(function () use ($user, $data) {
            $seat = Gate::member($user, true, 'owner'); $p = self::get($seat->organization_id);
            $providers = array_values(array_unique($data['allowedProviders'])); sort($providers);
            $body = ['enabled' => (bool) $data['enabled'], 'allowedProviders' => $providers,
                'dailyTaskLimit' => (int) $data['dailyTaskLimit'], 'retentionDays' => (int) $data['retentionDays']];
            $hash = Canonical::hash($body); $expected = (int) $data['expectedRevision'];
            if ((int) $p->revision === $expected + 1 && hash_equals((string) $p->request_hash, $hash)) return self::payload($p);
            if ((int) $p->revision !== $expected) ApiError::throw(409, 'organisation_policy_changed', 'Reload the current organisation policy.');
            DB::table('agent_organisation_policies')->updateOrInsert(['organization_id' => $seat->organization_id],
                ['revision' => $expected + 1, 'enabled' => $body['enabled'], 'allowed_providers' => json_encode($providers),
                    'daily_task_limit' => $body['dailyTaskLimit'], 'retention_days' => $body['retentionDays'],
                    'request_hash' => $hash, 'updated_at' => now(), 'created_at' => now()]);
            Audit::record($seat->organization_id, $user, 'policy.changed', null, $expected + 1);
            return self::payload(self::get($seat->organization_id));
        });
    }
}
