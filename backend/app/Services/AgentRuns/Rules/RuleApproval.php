<?php

namespace App\Services\AgentRuns\Rules;

use App\Models\AgentV2\{ApprovalRule, Run, ToolAction};
use App\Services\AgentRuns\Events;
use App\Services\Platform\AccountActivity;

/**
 * Records a standing rule's approval of a pending write. It is a pre-approval, not a bypass: the action already carries its
 * exact fingerprint, dispatch still rechecks grant, connection, expiry and fingerprint, and the rule itself is checked again
 * at that moment (`stale`). A write whose payload holds a secret is never pre-approved: that card needs the person.
 */
final class RuleApproval
{
    public function __construct(private readonly Rules $rules, private readonly Events $events) {}

    /** Called inside the broker's transaction with the run locked and the action just created. True when the rule approved it. */
    public function preapprove(ToolAction $action, Run $run): bool
    {
        if (!Rules::enabled() || !empty($action->secret_kinds) || $action->state !== 'pending_approval'
            || !in_array(\App\Services\AgentRuns\Jobs\Contexts::mode($run), ['ordered', 'independent'], true)) return false;
        if (\App\Services\AgentRuns\Guard\SecretGuard::kindsIn($action->arguments ?? [])) return false;
        $rule = $this->rules->match($action, $run);
        $locked = $rule ? ApprovalRule::query()->whereKey($rule->id)->lockForUpdate()->first() : null; // waits out a concurrent revoke
        if (!$locked || $locked->revoked_at || $locked->effect !== 'allow' || $locked->expires_at->isPast()) return false;
        $rule = $this->rules->match($action, $run);
        if (!$rule || $rule->id !== $locked->id) return false;
        $action->forceFill(['state' => 'approved', 'decision' => 'allow', 'approved_by' => 'rule', 'rule_id' => $rule->id,
            'rule_revision' => $rule->revision])->save();
        $rule->forceFill(['use_count' => $rule->use_count + 1, 'last_used_at' => now()])->save();
        $this->events->append($run, 'approval.decided', ['actionId' => $action->id, 'decision' => 'allow', 'source' => 'rule', 'ruleId' => $rule->id]);
        AccountActivity::record($run->user_id, 'rule.used', ['tool' => $action->tool, 'effect' => 'allow', 'rule' => substr($rule->id, 0, 8),
            'run' => substr($run->id, 0, 8)], 'system');
        return true;
    }

    /** True when this action was approved by a rule that no longer applies (revoked, expired, paused, a new "ask", or a changed scope). */
    public function stale(ToolAction $action, Run $run): bool
    {
        return $action->approved_by === 'rule' && $this->rules->match($action, $run, true) === null;
    }
}
