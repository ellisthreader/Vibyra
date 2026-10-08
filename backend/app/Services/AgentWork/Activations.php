<?php
namespace App\Services\AgentWork;

use App\Models\User;
use App\Services\AgentRuns\{Access, ApiError, Canonical, Grants};
use App\Services\Membership\PlanLimits;
use Illuminate\Support\Facades\DB;

/** User-only caller; one reviewed proposal/key creates one immutable saved target. */
final class Activations
{
    public static function enabled(): void
    {
        if (!config('agents_v2.work_enabled')) ApiError::throw(503, 'agent_work_disabled', 'Saved goals and follow-ups are not enabled.');
    }

    public function save(int $userId, string $kind, array $spec, string $key, callable $create, callable $read): array
    {
        abort_unless(preg_match('/^[A-Za-z0-9._:-]{1,120}$/D', $key), 422, 'Use a valid activation key.');
        return DB::transaction(function () use ($userId, $kind, $spec, $key, $create, $read) {
            $user = User::query()->whereKey($userId)->lockForUpdate()->firstOrFail();
            $receipt = DB::table('agent_work_activations')->where('user_id', $userId)->where('activation_key', $key)->first();
            $hash = Canonical::hash($spec);
            if ($receipt) {
                if ($receipt->kind !== $kind || !hash_equals($receipt->spec_hash, $hash))
                    ApiError::throw(409, 'work_activation_conflict', 'That review was already used for different work.');
                return $read($receipt->target_id);
            }
            self::enabled(); app(Access::class)->require($userId);
            if (isset($spec['expiresAt'])) abort_unless(\Carbon\CarbonImmutable::parse($spec['expiresAt'])->isFuture(), 422, 'Choose a future expiry.');
            if (isset($spec['condition']['at'])) abort_unless(\Carbon\CarbonImmutable::parse($spec['condition']['at'])->isFuture(), 422, 'Choose a future follow-up time.');
            if (!app(PlanLimits::class)->allows($user, 'agents')) ApiError::throw(402, 'plan_required', 'Agents need Pro.');
            app(Grants::class)->agent($userId, $spec['agentId']);
            if (isset($spec['condition']['triggerId'])) app(FollowUpSources::class)->source($userId, $spec['agentId'], $spec['condition'], true);
            $snapshot = [...RuntimePins::capture($userId, $spec['runtimeId']), 'workAgentId' => $spec['agentId'],
                'skillsHash' => SkillSnapshots::selectionHash($userId, $spec['agentId'])];
            $target = $create($snapshot);
            DB::table('agent_work_activations')->insert(['user_id' => $userId, 'activation_key' => $key, 'kind' => $kind,
                'spec_hash' => $hash, 'target_id' => $target['id'], 'target_revision' => $target['revision'],
                'runtime_snapshot' => Canonical::json($snapshot), 'created_at' => now(), 'updated_at' => now()]);
            return $target;
        });
    }
}
