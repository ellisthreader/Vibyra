<?php
namespace App\Services\AgentOrganizations;
use App\Models\{OrganizationMember, AgentV2\Run, AgentV2\RuntimeBinding};
use App\Services\AgentRuns\{ApiError, Canonical, RuntimeBindings};
use App\Services\Teams\Teams;
use Illuminate\Support\Facades\DB;
final class Authority
{
    /** Account mutex precedes this organisation lock; callers retain it through admission or dispatch intent. */
    public static function prepare(int $user, string $agent, string $mode, RuntimeBinding $runtime): ?array
    {
        $i = Instances::get($agent); if (!$i) return null;
        if (in_array($mode, ['channel', 'browser_test'], true))
            ApiError::throw(409, 'organisation_scope_unsupported', 'Organisation Agents cannot run in a public channel or a browser teaching test. Use a personal Agent for those isolated tasks.');
        $p = self::check($i);
        $count = DB::table('agent_organisation_runs')->where('organization_id', $i->organization_id)->where('user_id', $user)
            ->where('created_at', '>=', now()->utc()->startOfDay())->count();
        if ($count >= $p->daily_task_limit) ApiError::throw(429, 'organisation_daily_limit', 'Your organisation daily Agent task limit has been reached.');
        return ['organization_id' => $i->organization_id, 'definition_id' => $i->definition_id,
            'definition_revision' => $i->revision, 'user_id' => $user, 'member_id' => $i->member_id,
            'policy_revision' => $p->revision, 'allowed_providers' => $p->allowed_providers,
            'runtime_id' => $runtime->id, 'runtime_hash' => self::runtimeHash(RuntimeBindings::snapshot($runtime))];
    }
    private static function check(object $pin): object
    {
        Teams::lock($pin->organization_id);
        if (!Gate::enabled()) ApiError::throw(409, 'organisation_disabled', 'Organisation Agent execution was disabled.');
        $seat = OrganizationMember::query()->whereKey($pin->member_id)->where('organization_id', $pin->organization_id)
            ->where('user_id', $pin->user_id)->first();
        if (!$seat) ApiError::throw(409, 'organisation_membership_changed', 'Your organisation membership changed. This task cannot use another member account.');
        $d = Definitions::find($pin->organization_id, $pin->definition_id); $p = Policies::get($pin->organization_id);
        if ($d->retired_at || !$p->enabled) ApiError::throw(409, 'organisation_agent_unavailable', 'This organisation Agent was retired or disabled.');
        return $p;
    }
    public static function instance(string $agent, ?string $provider = null): void
    {
        $i = Instances::get($agent); if (!$i) return;
        $p = self::check($i);
        if ($provider !== null && !in_array($provider, json_decode($p->allowed_providers, true), true))
            ApiError::throw(409, 'organisation_provider_denied', 'Your organisation policy does not allow this connector.');
    }
    /** Background discovery uses the same member-seat/policy boundary before admitting its provider read. */
    public static function discovery(string $agent, int $user, string $provider): void
    {
        if (!Instances::get($agent)) return;
        DB::transaction(function () use ($agent, $user, $provider) {
            \App\Services\AgentRuns\Jobs\AccountLock::force($user);
            self::instance($agent, $provider);
        });
    }
    public static function capture(Run $run, ?array $pin): void
    {
        if ($pin) DB::table('agent_organisation_runs')->insert(['run_id' => $run->id, ...$pin,
            'runtime_hash' => self::runtimeHash($run->runtime_snapshot), 'created_at' => now()]);
    }
    public static function pin(string $run): ?object
    {
        return DB::table('agent_organisation_runs')->where('run_id', $run)->first();
    }
    public static function fence(string $runId, bool $factualReceipt = false): void
    {
        $pin = self::pin($runId); if (!$pin || $factualReceipt) return;
        self::check($pin);
        $runtime = RuntimeBinding::query()->find($pin->runtime_id);
        if (!$runtime || $runtime->revoked_at || !hash_equals($pin->runtime_hash, self::runtimeHash(RuntimeBindings::snapshot($runtime))))
            ApiError::throw(409, 'organisation_runtime_changed', 'The organisation task belongs to its originally selected runtime account.');
    }
    private static function runtimeHash(array $snapshot): string
    {
        // Reconnecting rotates runner keys/revision; it must not change the selected execution identity.
        return Canonical::hash(array_intersect_key($snapshot, array_flip([
            'bindingId', 'hostId', 'executionTarget', 'cloudWorkspaceId', 'provider', 'accountRef', 'model', 'effort'])));
    }
    public static function allows(Run $run, string $provider): bool
    {
        if (!$run->exists) {
            $instance = Instances::get($run->agent_id); if (!$instance) return true;
            return DB::transaction(function () use ($run, $instance, $provider) {
                \App\Services\AgentRuns\Jobs\AccountLock::force($run->user_id);
                $policy = self::check($instance);
                return in_array($provider, json_decode($policy->allowed_providers, true), true);
            });
        }
        $pin = self::pin($run->id); if (!$pin) return true;
        $p = Policies::get($pin->organization_id);
        return in_array($provider, json_decode($pin->allowed_providers, true), true)
            && in_array($provider, json_decode($p->allowed_providers, true), true);
    }
    public static function filterSnapshot(array $snapshot, ?array $pin): array
    {
        if (!$pin) return $snapshot;
        $allowed = json_decode($pin['allowed_providers'], true);
        return array_values(array_filter($snapshot, function ($grant) use ($allowed) {
            $provider = DB::table('agent_connections')->where('id', $grant['connectionId'])->value('provider');
            return in_array($provider, $allowed, true);
        }));
    }
    /** Keep immutable published instructions and shared knowledge while private memory/history remain member-scoped. */
    public static function profile(Run $run, array $profile, string $notes = ''): array
    {
        $pin = self::pin($run->id); if (!$pin) return $profile;
        $v = Definitions::version($pin->definition_id, $pin->definition_revision);
        $brief = $v->instructions.($v->knowledge !== '' ? "\n\nOrganisation shared knowledge:\n".$v->knowledge : '');
        return [...$profile, 'name' => $v->name, 'brief' => \App\Services\AgentRuns\Planning\RunNotes::brief($brief, $notes)];
    }
    public static function metadata(Run $run): ?array
    {
        $pin = self::pin($run->id); if (!$pin) return null;
        return ['organizationId' => $pin->organization_id, 'definitionId' => $pin->definition_id,
            'definitionRevision' => (int) $pin->definition_revision, 'memberSeatId' => (int) $pin->member_id,
            'humanActorId' => (int) $pin->user_id, 'runtimeId' => $pin->runtime_id,
            'policyRevision' => (int) $pin->policy_revision, 'contentCleared' => $pin->content_cleared_at !== null];
    }
}
