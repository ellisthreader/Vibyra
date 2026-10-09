<?php
use Illuminate\Support\Facades\{Artisan, DB, Schema};

/** Reverse only Stage 5 on the harness database; all preexisting work remains intact. */
final class ConcStageFiveUpgrade
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage 5 migration upgrade'; conc_guard();
        $new = ['2026_10_09_040000_create_agent_coordination', '2026_10_09_050000_create_agent_jobs'];
        if (DB::table('migrations')->whereIn('migration', $new)->count() !== 2) throw new RuntimeException('Stage 5 migrations missing.');
        config(['agents_v2.parallel_jobs_enabled' => false, 'agents_v2.coordination_enabled' => false]);
        $fx = ConcFixture::make(true); ConcFixture::admit($fx, 'Preserve the pending earlier-stage write.'); $run = ConcFixture::claim($fx);
        $action = ConcFixture::write($fx, $run, ['to' => 'fixture@example.test', 'subject' => 'Migration', 'body' => 'Do not send.'], 'stage5-upgrade');
        $before = self::snapshot($fx, $run, $action);
        $baseline = DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson();
        foreach ([1, 2] as $round) {
            $batch = (int) DB::table('migrations')->max('batch') + 1;
            DB::table('migrations')->whereIn('migration', $new)->update(['batch' => $batch]);
            if (DB::table('migrations')->where('batch', $batch)->count() !== 2) throw new RuntimeException('Unexpected migration batch.');
            $status = Artisan::call('migrate:rollback', ['--batch' => $batch, '--force' => true]);
            Conc::check('rollback '.$round.' preserves older task, exact approval and saved work schema', $status === 0
                && !Schema::hasTable('agent_groups') && !Schema::hasTable('agent_run_jobs')
                && Schema::hasTable('agent_work_goals') && Schema::hasTable('agent_signal_watches')
                && self::snapshot($fx, $run, $action) === $before
                && DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson() === $baseline);
            $status = Artisan::call('migrate', ['--force' => true]);
            Conc::check('upgrade '.$round.' restores groups, workflows, job slots and resource fences', $status === 0
                && Schema::hasTable('agent_groups') && Schema::hasTable('agent_workflows') && Schema::hasTable('agent_job_resources')
                && Schema::hasColumn('agent_run_jobs', 'slot_generation') && Schema::hasTable('agent_runtime_slots')
                && self::snapshot($fx, $run, $action) === $before
                && DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson() === $baseline);
        }
        Conc::check('migration verification never dispatched the pending write', ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']) === 0);
    }
    private static function snapshot(array $fx, array $run, array $action): array
    {
        return [(array) DB::table('agent_runs')->where('id', $run['id'])->first(['id', 'prompt', 'state', 'runtime_snapshot', 'grant_snapshot']),
            (array) DB::table('agent_tool_actions')->where('id', $action['id'])->first(['id', 'arguments', 'fingerprint', 'state', 'dispatched_at'])];
    }
}
