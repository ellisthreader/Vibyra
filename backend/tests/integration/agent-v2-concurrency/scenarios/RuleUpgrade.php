<?php
use App\Models\AgentV2\{ApprovalRule, ToolAction};
use App\Services\AgentRuns\Rules\Rules;
use Illuminate\Support\Facades\{Artisan, DB, Schema};
final class ConcRuleUpgrade
{
    public static function run(): void
    {
        require_once __DIR__.'/../RuleOps.php'; ConcRuleOps::setup(); Conc::$scenario = 'Standing rules migration upgrade';
        $fx = ConcFixture::make(false); $github = ConcFixture::github($fx);
        $rule = app(Rules::class)->save($fx['user'], $fx['agent'], ['tool' => 'github_create_issue', 'connectionId' => $github,
            'effect' => 'allow', 'scope' => 'qa-org/sandbox', 'maxUses' => 2, 'expectedRevision' => 0]);
        $run = ConcFixture::admit($fx, 'Keep an existing task and approval through upgrade.'); $claimed = ConcFixture::claim($fx);
        config(['agent_depth.rules' => false]);
        $reply = ConcHttp::runner($fx, 'POST', '/runs/'.$run['id'].'/tools', ['generation' => $claimed['generation'], 'callId' => 'upgrade-rule',
            'tool' => 'github_create_issue', 'connectionId' => $github, 'schemaRevision' => app(\App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('github_create_issue'),
            'arguments' => ['repository' => 'qa-org/sandbox', 'title' => 'Fixture', 'body' => 'Synthetic rule migration']]);
        $action = ConcFixture::ok($reply, 200)['action']['id']; config(['agent_depth.rules' => true]);
        if (!ConcRuleOps::preapprove($action)) throw new RuntimeException('Could not reserve upgrade fixture action');
        $before = (array) DB::table('agent_runs')->where('id', $run['id'])->first();
        foreach ([1, 2] as $round) {
            $batch = (int) DB::table('migrations')->max('batch') + 1;
            DB::table('migrations')->where('migration', '2026_10_10_110000_bound_agent_rules')->update(['batch' => $batch]);
            $status = Artisan::call('migrate:rollback', ['--batch' => $batch, '--force' => true]);
            Conc::check('bounds rollback '.$round.' preserves existing action and reserved use', $status === 0
                && !Schema::hasColumn('agent_approval_rules', 'grant_revision') && ApprovalRule::findOrFail($rule->id)->use_count === 1
                && ToolAction::findOrFail($action)->state === 'approved' && $before === (array) DB::table('agent_runs')->where('id', $run['id'])->first());
            $status = Artisan::call('migrate', ['--force' => true]);
            $row = ApprovalRule::findOrFail($rule->id);
            Conc::check('bounds upgrade '.$round.' makes legacy rules inert until a new review', $status === 0 && $row->grant_id === null
                && $row->connection_generation === null && $row->schema_revision === null && $row->use_count === 1
                && app(Rules::class)->match(ToolAction::findOrFail($action), \App\Models\AgentV2\Run::findOrFail($run['id']), true) === null);
        }
        app(\App\Services\AgentRuns\Tools\Approvals::class)->dispatch($action);
        Conc::check('a pre-upgrade approval cannot dispatch using newly defaulted rule bounds', ToolAction::findOrFail($action)->state === 'refused'
            && ConcFakes::count('RULE_ISSUE', 'Bearer tok-gh-'.$fx['user']) === 0);
    }
}
