<?php

namespace App\Services\AgentRuns\Rules;

use App\Models\AgentV2\{ApprovalRule, Connection, Run, ToolAction};
use App\Services\AgentRuns\{ApiError, Grants};
use App\Services\AgentRuns\Tools\ToolCatalog;
use App\Services\AgentRuns\Jobs\AccountLock;
use App\Services\Platform\AccountActivity;
use Illuminate\Support\Facades\DB;

/**
 * Standing approval rules (roadmap Part 16): "always allow" or "always ask" for one tool on one connection, optionally one
 * repository, calendar, team or list, for a bounded time. A rule never skips approval: it records the approval in advance
 * (RuleApproval), and the exact fingerprint, tool, connection and scope are checked again when the action runs.
 */
final class Rules
{
    public function __construct(private readonly Grants $grants, private readonly ToolCatalog $catalog) {}

    public static function enabled(): bool
    {
        return (bool) config('agent_depth.rules');
    }

    public function paused(int $userId): bool
    {
        return (bool) DB::table('agent_rule_settings')->where('user_id', $userId)->value('paused');
    }

    public function pause(int $userId, bool $paused): void
    {
        DB::transaction(function () use ($userId, $paused) {
        AccountLock::force($userId);
        DB::table('agent_rule_settings')->updateOrInsert(['user_id' => $userId], ['paused' => $paused, 'updated_at' => now(), 'created_at' => now()]);
        AccountActivity::record($userId, 'rule.kill_switch', ['paused' => $paused]);
        });
    }

    /** @return array{rules: array, paused: bool, eligible: array} */
    public function overview(int $userId, string $agentId): array
    {
        $this->grants->agent($userId, $agentId);
        $rules = ApprovalRule::query()->where('user_id', $userId)->where('agent_id', $agentId)->whereNull('revoked_at')
            ->orderBy('created_at')->limit(200)->get();
        return ['rules' => $rules->map(fn (ApprovalRule $r) => $this->payload($r))->all(), 'paused' => $this->paused($userId),
            'eligible' => $this->eligible($userId, $agentId)];
    }

    /** Writes this teammate may use that a rule could approve, one row per account. */
    private function eligible(int $userId, string $agentId): array
    {
        $rows = [];
        $connections = Connection::query()->where('user_id', $userId)->whereNull('revoked_at')->get()->keyBy('id');
        foreach ($this->grants->active($userId, $agentId) as $grant) {
            $connection = $connections->get($grant->connection_id);
            foreach ($connection ? array_values(array_intersect(RuleEligibility::tools(), $grant->operations ?? [])) : [] as $tool)
                $rows[] = ['tool' => $tool, 'connectionId' => $connection->id, 'provider' => $connection->provider,
                    'account' => $connection->external_identity, 'takesScope' => RuleEligibility::takesScope($tool)];
        }
        return $rows;
    }

    /** Creates or updates the rule for this exact (teammate, tool, connection, scope). */
    public function save(int $userId, string $agentId, array $data): ApprovalRule
    {
        $agent = $this->grants->agent($userId, $agentId);
        $tool = (string) $data['tool'];
        $effect = (string) $data['effect'];
        $scope = RuleEligibility::normalize((string) ($data['scope'] ?? ''), $tool);
        if (!in_array($effect, ['ask', 'allow'], true) || !isset($data['expectedRevision']) || !is_int($data['expectedRevision']))
            ApiError::throw(422, 'rule_review_required', 'Review the current rule before saving.');
        if ($effect === 'allow' && RuleEligibility::takesScope($tool) && $scope === '')
            ApiError::throw(422, 'rule_scope_required', 'Choose the exact resource this rule may change.');
        $maxUses = (int) ($data['maxUses'] ?? 20);
        if ($maxUses < 1 || $maxUses > 100 || mb_strlen($scope) > 200)
            ApiError::throw(422, 'rule_limit', 'Choose between 1 and 100 uses and a resource of up to 200 characters.');
        if ($this->catalog->kind($tool) !== 'write')
            ApiError::throw(422, 'rule_not_allowed', 'Rules apply to actions that need your approval.');
        if ($effect === 'allow' && !RuleEligibility::allowed($tool))
            ApiError::throw(422, 'rule_not_allowed', 'Vibyra never lets this kind of action run on its own. It will always ask you.');
        if ($scope !== '' && !RuleEligibility::takesScope($tool)) ApiError::throw(422, 'rule_scope_unsupported', 'This action has no narrower scope.');
        $max = (int) config('agent_depth.rule_max_days');
        $days = max(1, min($max, (int) ($data['expiresInDays'] ?? config('agent_depth.rule_default_days'))));
        return DB::transaction(function () use ($userId, $agentId, $agent, $tool, $effect, $scope, $days, $data, $maxUses) {
            AccountLock::force($userId);
            DB::table('agent_teammates')->where('id', $agentId)->lockForUpdate()->first(); // one rule edit at a time per teammate
            $this->grants->agent($userId, $agentId);
            $granted = collect($this->grants->active($userId, $agentId))->first(fn ($g) => $g->connection_id === $data['connectionId']
                && in_array($tool, $g->operations ?? [], true));
            if (!$granted) ApiError::throw(422, 'rule_not_granted', 'This teammate has no access to that action on that account.');
            $connection = Connection::query()->whereKey($data['connectionId'])->where('user_id', $userId)->whereNull('revoked_at')->first();
            if (!$connection || $connection->health !== 'healthy') ApiError::throw(409, 'rule_account_changed', 'Reconnect this account and review the rule again.');
            $rule = ApprovalRule::query()->where('user_id', $userId)->where('agent_id', $agentId)->where('tool', $tool)
                ->where('connection_id', $data['connectionId'])->where('scope', $scope)->whereNull('revoked_at')->first();
            if (!$rule && ApprovalRule::query()->where('user_id', $userId)->whereNull('revoked_at')->count() >= (int) config('agent_depth.max_rules'))
                ApiError::throw(422, 'rule_limit', 'Remove a rule before adding another.');
            if (($rule?->revision ?? 0) !== $data['expectedRevision']) ApiError::throw(409, 'rule_changed', 'This rule changed. Refresh and review it again.');
            $fields = ['effect' => $effect, 'expires_at' => now()->addDays($days), 'revision' => ($rule?->revision ?? 0) + 1,
                'max_uses' => $maxUses, 'use_count' => 0, 'last_used_at' => null, 'connection_generation' => $connection->generation,
                'grant_id' => $granted->id, 'grant_revision' => $granted->revision, 'schema_revision' => $this->catalog->schemaRevision($tool)];
            if ($rule) $rule->forceFill($fields)->save();
            else $rule = ApprovalRule::query()->create(['user_id' => $userId, 'agent_id' => $agentId, 'tool' => $tool,
                'connection_id' => $data['connectionId'], 'scope' => $scope, ...$fields]);
            AccountActivity::record($userId, $rule->wasRecentlyCreated ? 'rule.created' : 'rule.changed', ['tool' => $tool, 'effect' => $effect,
                'days' => $days, 'scope' => $scope, 'teammate' => $agent->name, 'rule' => substr($rule->id, 0, 8)]);
            return $rule;
        });
    }

    public function revoke(int $userId, string $agentId, string $ruleId): void
    {
        DB::transaction(function () use ($userId, $agentId, $ruleId) {
        AccountLock::force($userId);
        $rule = ApprovalRule::query()->where('user_id', $userId)->where('agent_id', $agentId)->whereKey($ruleId)->whereNull('revoked_at')->first();
        if (!$rule) ApiError::throw(404, 'rule_not_found', 'That rule does not exist.');
        $rule->forceFill(['revoked_at' => now()])->save();
        AccountActivity::record($userId, 'rule.revoked', ['tool' => $rule->tool, 'effect' => $rule->effect, 'rule' => substr($rule->id, 0, 8)]);
        });
    }

    /** The "allow" rule that pre-approves this pending write, or null (ask the person). Any matching "ask" rule wins. */
    public function match(ToolAction $action, Run $run, bool $admitted = false): ?ApprovalRule
    {
        if (!self::enabled() || $this->paused($run->user_id) || !RuleEligibility::allowed($action->tool)) return null;
        $mode = \App\Models\AgentV2\Job::query()->whereKey($run->id)->value('mode');
        if (!in_array($mode, ['ordered', 'independent'], true)) return null;
        if ($this->catalog->schemaRevision($action->tool) !== $action->schema_revision) return null;
        $scope = RuleEligibility::scopeOf($action->tool, $action->arguments ?? []);
        $rules = ApprovalRule::query()->where('user_id', $run->user_id)->where('agent_id', $run->agent_id)->where('tool', $action->tool)
            ->where('connection_id', $action->connection_id)->whereNull('revoked_at')->where('expires_at', '>', now())->get()
            ->filter(fn (ApprovalRule $r) => $r->scope === '' || $r->scope === $scope);
        if ($rules->contains('effect', 'ask')) return null;
        return $rules->sortByDesc(fn (ApprovalRule $r) => $r->scope !== '')->first(fn (ApprovalRule $r) => $r->effect === 'allow'
            && $r->connection_generation === (int) $action->connection_generation && $r->grant_id === $action->grant_id
            && $r->grant_revision === (int) $action->grant_revision && $r->schema_revision === $action->schema_revision && $r->max_uses > 0
            && ($admitted ? ($r->id === $action->rule_id && $r->revision === (int) $action->rule_revision && $r->use_count <= $r->max_uses)
                : $r->use_count < $r->max_uses));
    }

    public function payload(ApprovalRule $r): array
    {
        return ['id' => $r->id, 'agentId' => $r->agent_id, 'tool' => $r->tool, 'connectionId' => $r->connection_id, 'scope' => $r->scope,
            'effect' => $r->effect, 'revision' => $r->revision, 'maxUses' => $r->max_uses, 'remainingUses' => max(0, $r->max_uses - $r->use_count),
            'expiresAt' => $r->expires_at?->toIso8601String(), 'expired' => $r->expires_at?->isPast() ?? false,
            'useCount' => $r->use_count, 'lastUsedAt' => $r->last_used_at?->toIso8601String(), 'createdAt' => $r->created_at?->toIso8601String()];
    }
}
