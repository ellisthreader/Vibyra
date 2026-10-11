<?php
use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\{Jobs\AccountLock, Rules\RuleApproval, Rules\Rules, Tools\Approvals};
use Illuminate\Support\Facades\{DB, Http};
final class ConcRuleOps
{
    public static function setup(): void
    {
        config(['agent_depth.rules' => true, 'platform.activity' => true]);
    }
    public static function run(array $a): array
    {
        self::setup(); $service = app(Rules::class);
        if ($a['mode'] === 'call') return ConcHttp::runner($a['fx'], 'POST', '/runs/'.$a['run']['id'].'/tools', $a['json']);
        if ($a['mode'] === 'http') return ConcHttp::call($a['method'], $a['uri'], $a['fx']['token'], $a['json'] ?? []);
        $out = match ($a['mode']) {
            'dispatch' => app(Approvals::class)->dispatch($a['action']),
            'pause' => $service->pause($a['fx']['user'], true),
            'revoke' => $service->revoke($a['fx']['user'], $a['fx']['agent'], $a['rule']),
            'ask' => $service->save($a['fx']['user'], $a['fx']['agent'], $a['ruleBody']),
            default => throw new InvalidArgumentException('Unknown rule operation'),
        };
        return ['status' => 200, 'json' => ['result' => is_object($out) ? $out->id : $out]];
    }
    public static function preapprove(string $id): bool
    {
        return DB::transaction(function () use ($id) {
            $a = ToolAction::findOrFail($id); AccountLock::force($a->user_id);
            $r = Run::whereKey($a->run_id)->lockForUpdate()->firstOrFail();
            $a = ToolAction::whereKey($id)->lockForUpdate()->firstOrFail();
            return app(RuleApproval::class)->preapprove($a, $r);
        });
    }
}
