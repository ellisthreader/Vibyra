<?php
use App\Models\AgentV2\{ApprovalRule, Run, ToolAction};
use App\Services\AgentRuns\Rules\Rules;
use Illuminate\Support\Facades\DB;
final class ConcRules
{
    public static function run(): void
    {
        require_once __DIR__.'/../RuleOps.php'; ConcRuleOps::setup(); Conc::$scenario = 'Bounded standing rule authority';
        self::limit(); foreach (['pause', 'revoke', 'ask'] as $kind) self::dispatchRace($kind);
        self::connectionPins(); self::staleSave();
        Conc::check('rule races have no deadlocks', ConcPg::count('deadlock detected') === 0);
    }
    private static function fixture(int $uses = 2): array
    {
        $fx = ConcFixture::make(false); $fx['github'] = ConcFixture::github($fx);
        $body = ['tool' => 'github_create_issue', 'connectionId' => $fx['github'], 'effect' => 'allow',
            'scope' => 'qa-org/sandbox', 'expiresInDays' => 1, 'expectedRevision' => 0, 'maxUses' => $uses];
        $rule = app(Rules::class)->save($fx['user'], $fx['agent'], $body);
        ConcFixture::admit($fx, 'Create a reviewed fixture issue'); $run = ConcFixture::claim($fx);
        return compact('fx', 'body', 'rule', 'run');
    }
    private static function call(array $f, string $id): array
    {
        return ['op' => 'rules', 'mode' => 'call', 'fx' => $f['fx'], 'run' => $f['run'], 'json' => [
            'generation' => $f['run']['generation'], 'callId' => $id, 'tool' => 'github_create_issue', 'connectionId' => $f['fx']['github'],
            'schemaRevision' => app(\App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('github_create_issue'),
            'arguments' => ['repository' => 'qa-org/sandbox', 'title' => 'Fixture '.$id, 'body' => 'Synthetic rule test']]];
    }
    private static function sends(array $fx): int
    {
        return ConcFakes::count('RULE_ISSUE', 'Bearer tok-gh-'.$fx['user']);
    }
    private static function limit(): void
    {
        $f = self::fixture(2); $race = ConcRace::run(array_map(fn ($i) => self::call($f, 'rule-limit-'.$i), range(1, 8)));
        $reserved = ApprovalRule::findOrFail($f['rule']->id)->use_count;
        Conc::check('parallel tool requests cannot exceed the two reviewed rule uses', $reserved === 2 && self::sends($f['fx']) === 2,
            json_encode(Conc::tally($race)).' reserved='.$reserved.' sends='.self::sends($f['fx']));
        $completed = ToolAction::where('run_id', $f['run']['id'])->where('state', 'completed')->firstOrFail();
        $job = self::call($f, $completed->call_id); $job['json']['arguments'] = $completed->arguments;
        $retried = ConcRace::run(array_fill(0, 5, $job));
        Conc::check('same action retries never reserve or send another use', self::sends($f['fx']) === 2
            && ApprovalRule::findOrFail($f['rule']->id)->use_count === 2, json_encode(Conc::tally($retried)));
    }
    private static function prepared(array $f): ToolAction
    {
        config(['agent_depth.rules' => false]); $j = self::call($f, 'prepared-rule-write');
        $response = ConcHttp::runner($f['fx'], 'POST', '/runs/'.$f['run']['id'].'/tools', $j['json']);
        config(['agent_depth.rules' => true]);
        $id = ConcFixture::ok($response, 200)['action']['id'];
        if (!ConcRuleOps::preapprove($id)) throw new RuntimeException('Fixture rule did not reserve its action');
        return ToolAction::findOrFail($id);
    }
    private static function dispatchRace(string $kind): void
    {
        $f = self::fixture(); $action = self::prepared($f);
        $change = ['op' => 'rules', 'mode' => $kind, 'fx' => $f['fx'], 'rule' => $f['rule']->id,
            'ruleBody' => [...$f['body'], 'scope' => '', 'effect' => 'ask']];
        $race = ConcRace::run([$change, ['op' => 'rules', 'mode' => 'dispatch', 'fx' => $f['fx'], 'action' => $action->id]]);
        $state = $action->fresh()->state;
        Conc::check($kind.' versus dispatch yields at most one intent admitted before restriction', Conc::tally($race) === ['200' => 2]
            && in_array($state, ['completed', 'refused'], true) && self::sends($f['fx']) === ($state === 'completed' ? 1 : 0),
            json_encode(Conc::tally($race)).' '.$state);
        app(\App\Services\AgentRuns\Tools\Approvals::class)->dispatch($action->id);
        Conc::check($kind.' never replays or refunds the reserved use', self::sends($f['fx']) <= 1
            && ApprovalRule::findOrFail($f['rule']->id)->use_count === 1);
    }
    private static function connectionPins(): void
    {
        foreach (['connection', 'grant'] as $pin) {
            $f = self::fixture(); $action = self::prepared($f);
            if ($pin === 'connection') DB::table('agent_connections')->where('id', $f['fx']['github'])->increment('generation');
            else DB::table('agent_grants')->where('agent_id', $f['fx']['agent'])->where('connection_id', $f['fx']['github'])->increment('revision');
            app(\App\Services\AgentRuns\Tools\Approvals::class)->dispatch($action->id);
            Conc::check($pin.' replacement invalidates already reserved rule approval', $action->fresh()->state === 'refused' && self::sends($f['fx']) === 0);
        }
    }
    private static function staleSave(): void
    {
        $f = self::fixture(1); self::prepared($f);
        $uri = '/api/agents/v2/agents/'.$f['fx']['agent'].'/rules';
        $jobs = array_fill(0, 6, ['op' => 'rules', 'mode' => 'http', 'fx' => $f['fx'], 'method' => 'POST', 'uri' => $uri, 'json' => $f['body']]);
        $race = ConcRace::run($jobs);
        Conc::check('stale rule retries cannot reset exhausted budget', collect($race)->every(fn ($r) => ($r['result']['status'] ?? 0) === 409)
            && ApprovalRule::findOrFail($f['rule']->id)->use_count === 1, json_encode(Conc::tally($race)));
    }
}
