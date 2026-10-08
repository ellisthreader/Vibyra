<?php
use App\Services\AgentRuns\Delegation\Delegation;
use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Support\Facades\DB;

/**
 * Scenario 14 (roadmap Part 16): delegation admission and standing-rule use, raced from many real processes. A parent's
 * per-run cap and its idempotent call id hold with ten callers; a child finishing while its parent is cancelled never deadlocks
 * or strands the waiting action; a rule approves each distinct call exactly once, a repeated call id only once, and a revoke
 * racing the calls never produces a duplicate provider write.
 */
final class ConcDepth
{
    public static function run(): void
    {
        Conc::$scenario = '14 depth (delegation, rules)';
        self::delegationCap();
        self::delegationRetry();
        self::childFinishesWhileParentCancels();
        self::ruleUse();
        self::ruleRevokeRace();
    }

    private static function parent(int $mates): array
    {
        $fx = ConcFixture::make(false);
        $fx['mates'] = array_map(fn () => ConcFixture::teammate($fx, null), range(1, $mates));
        $run = ConcFixture::admit($fx, 'Plan the launch.');
        $fx['claimed'] = ConcFixture::claim($fx);
        $fx['run'] = $run['id'];
        return $fx;
    }

    private static function delegate(array $fx, string $mate, string $callId, int $jitter = 0): array
    {
        $c = $fx['claimed'];
        return ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/tools', 'jitterMs' => $jitter,
            'json' => ['generation' => $c['generation'], 'callId' => $callId, 'tool' => 'delegate_task', 'connectionId' => $c['id'],
                'schemaRevision' => Delegation::schemaRevision(), 'arguments' => ['teammate' => $mate, 'task' => 'Find a slot']]];
    }

    private static function delegationCap(): void
    {
        $fx = self::parent(5);
        $race = ConcRace::run(array_map(fn ($i) => self::delegate($fx, $fx['mates'][$i % 5], 'dist-'.$i), range(0, 9)));
        $children = DB::table('agent_runs')->where('parent_run_id', $fx['run'])->count();
        $actions = DB::table('agent_tool_actions')->where('run_id', $fx['run'])->where('tool', 'delegate_task')->get()->groupBy('state')->map->count()->all();
        $started = (int) DB::table('agent_runs')->where('id', $fx['run'])->value('delegations_started');
        Conc::check('10 parallel delegate_task calls against a cap of 3: exactly 3 delegated runs, 3 waiting actions, 7 refused delegation_limit, every caller got 200',
            $children === 3 && $started === 3 && ($actions['dispatching'] ?? 0) === 3 && ($actions['refused'] ?? 0) === 7 && Conc::tally($race) === ['200' => 10],
            'children='.$children.' started='.$started.' '.json_encode($actions).' '.Conc::fmt(Conc::tally($race)));
        $own = DB::table('agent_runs')->where('parent_run_id', $fx['run'])->get()->every(fn ($c) => json_decode($c->grant_snapshot, true) === [] && (int) $c->delegation_depth === 1);
        Conc::check('each delegated run holds only its own teammate\'s grants (none here, never the parent\'s) and sits at depth 1', $own);
    }

    private static function delegationRetry(): void
    {
        $fx = self::parent(1);
        $race = ConcRace::run(array_fill(0, 10, self::delegate($fx, $fx['mates'][0], 'same-call')));
        $ids = array_unique(array_map(fn ($r) => $r['result']['json']['action']['id'] ?? '?', $race));
        $children = DB::table('agent_runs')->where('parent_run_id', $fx['run'])->count();
        Conc::check('10 parallel delegate_task calls with one call id: one action, one delegated run, the same action id for every caller',
            count($ids) === 1 && $children === 1 && Conc::tally($race) === ['200' => 10], 'ids='.count($ids).' children='.$children.' '.Conc::fmt(Conc::tally($race)));
    }

    private static function childFinishesWhileParentCancels(): void
    {
        $fx = self::parent(1);
        ConcRace::run([self::delegate($fx, $fx['mates'][0], 'only')]);
        $kid = ConcFixture::claim($fx);
        $jobs = [['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$fx['run'].'/cancel', 'token' => $fx['token'], 'jitterMs' => 6],
            ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$kid['id'].'/complete', 'json' => ['generation' => $kid['generation'], 'answer' => 'Thursday'], 'jitterMs' => 6],
            ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$kid['id'].'/cancel', 'token' => $fx['token'], 'jitterMs' => 6]];
        $race = ConcRace::run($jobs);
        $t = Conc::tally($race);
        $parent = DB::table('agent_runs')->where('id', $fx['run'])->value('state');
        $child = DB::table('agent_runs')->where('id', $kid['id'])->value('state');
        $action = DB::table('agent_tool_actions')->where('run_id', $fx['run'])->where('tool', 'delegate_task')->value('state');
        Conc::check('the delegated run finishing while its parent and itself are cancelled: no 5xx or deadlock, parent cancelled, child ended, the waiting action settled',
            $parent === 'cancelled' && in_array($child, ['completed', 'cancelled'], true) && $action !== 'dispatching' && !array_filter(array_keys($t), fn ($k) => str_starts_with((string) $k, '5') || $k === 'crash'),
            Conc::fmt($t).' parent='.$parent.' child='.$child.' action='.$action);
    }

    private static function ruleFixture(): array
    {
        $fx = ConcFixture::make(false);
        $fx['github'] = ConcFixture::github($fx);
        ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/agents/'.$fx['agent'].'/rules', $fx['token'], ['tool' => 'github_create_issue', 'connectionId' => $fx['github'], 'effect' => 'allow']), 200);
        ConcFixture::admit($fx, 'Open the issues.');
        $fx['claimed'] = ConcFixture::claim($fx);
        return $fx;
    }

    private static function issue(array $fx, string $callId, int $jitter = 0): array
    {
        $c = $fx['claimed'];
        return ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/tools', 'jitterMs' => $jitter,
            'json' => ['generation' => $c['generation'], 'callId' => $callId, 'tool' => 'github_create_issue', 'connectionId' => $fx['github'],
                'schemaRevision' => app(ToolCatalog::class)->schemaRevision('github_create_issue'), 'arguments' => ['repository' => 'octo/app', 'title' => 'Issue '.$callId]]];
    }

    private static function ruleUse(): void
    {
        $fx = self::ruleFixture();
        $race = ConcRace::start(array_fill(0, 10, self::issue($fx, 'same-issue')), 0, ['CONC_SEND_DELAY_MS' => '120'])->release()->results();
        $actions = DB::table('agent_tool_actions')->where('run_id', $fx['claimed']['id'])->get();
        $sends = ConcFakes::count('GITHUB_ISSUE');
        Conc::check('10 parallel identical calls covered by a rule: one action approved by the rule, one provider write, rule used once, every caller got 200',
            $actions->count() === 1 && $actions[0]->approved_by === 'rule' && $actions[0]->state === 'completed' && $sends === 1
            && (int) DB::table('agent_approval_rules')->where('agent_id', $fx['agent'])->value('use_count') === 1 && Conc::tally($race) === ['200' => 10],
            'actions='.$actions->count().' sends='.$sends.' '.Conc::fmt(Conc::tally($race)));
        $race = ConcRace::run(array_map(fn ($i) => self::issue($fx, 'issue-'.$i), range(1, 10)));
        $by = DB::table('agent_tool_actions')->where('run_id', $fx['claimed']['id'])->get();
        Conc::check('10 parallel DISTINCT calls covered by the rule: each approved by it and written exactly once (11 provider writes in all), use count 11',
            $by->count() === 11 && $by->every(fn ($a) => $a->approved_by === 'rule' && $a->state === 'completed') && ConcFakes::count('GITHUB_ISSUE') === 11
            && (int) DB::table('agent_approval_rules')->where('agent_id', $fx['agent'])->value('use_count') === 11,
            'actions='.$by->count().' sends='.ConcFakes::count('GITHUB_ISSUE').' '.Conc::fmt(Conc::tally($race)));
    }

    private static function ruleRevokeRace(): void
    {
        $fx = self::ruleFixture();
        $before = ConcFakes::count('GITHUB_ISSUE');
        $rule = DB::table('agent_approval_rules')->where('agent_id', $fx['agent'])->value('id');
        $jobs = array_map(fn ($i) => self::issue($fx, 'race-'.$i, 8), range(1, 12));
        $jobs[] = ['op' => 'call', 'method' => 'DELETE', 'uri' => '/api/agents/v2/agents/'.$fx['agent'].'/rules/'.$rule, 'token' => $fx['token'], 'jitterMs' => 8];
        $race = ConcRace::run($jobs);
        $t = Conc::tally($race);
        $by = DB::table('agent_tool_actions')->where('run_id', $fx['claimed']['id'])->get();
        $byRule = $by->where('approved_by', 'rule');
        $sent = ConcFakes::count('GITHUB_ISSUE') - $before;
        $used = (int) DB::table('agent_approval_rules')->where('id', $rule)->value('use_count');
        $others = array_filter(array_keys($t), fn ($k) => !in_array((string) $k, ['200', '409:run_not_active'], true));
        Conc::check('12 calls racing a revoke of their rule: each is approved by the rule or waits for the person (then the run is waiting and refuses the rest); use count = rule approvals = provider writes; no 5xx',
            $used === $byRule->count() && $sent === $byRule->count() && $byRule->every(fn ($a) => $a->state === 'completed')
            && $by->reject(fn ($a) => $a->approved_by === 'rule')->every(fn ($a) => $a->state === 'pending_approval') && $by->reject(fn ($a) => $a->approved_by === 'rule')->count() <= 1 && !$others,
            'rule='.$byRule->count().' of '.$by->count().' used='.$used.' sent='.$sent.' '.Conc::fmt($t));
        // A run still waiting on one card refuses more calls, so a fresh run proves the revoke on its own.
        $fx2 = $fx;
        ConcFixture::admit($fx2, 'Another.', null);
        DB::table('agent_runs')->where('id', $fx['claimed']['id'])->update(['state' => 'cancelled', 'finished_at' => now(), 'lease_expires_at' => null]);
        $fx2['claimed'] = ConcFixture::claim($fx2);
        ConcRace::run([self::issue($fx2, 'after-revoke')]);
        $action = DB::table('agent_tool_actions')->where('run_id', $fx2['claimed']['id'])->where('call_id', 'after-revoke')->value('state');
        Conc::check('once the revoke has returned, a new call waits for the person (pending_approval) and writes nothing',
            $action === 'pending_approval' && ConcFakes::count('GITHUB_ISSUE') - $before === $sent, 'state='.$action);
    }
}
