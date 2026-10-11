<?php
use Illuminate\Support\Facades\{Artisan, DB, Schema};
final class ConcStageSevenUpgrade
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage7 migration upgrade'; conc_guard();
        $new = '2026_10_10_100000_create_agent_organisations';
        $fx = ConcFixture::make(false); $run = ConcFixture::admit($fx, 'Preserve an earlier personal task.');
        $before = (array) DB::table('agent_runs')->where('id', $run['id'])->first();
        foreach ([1, 2] as $round) {
            $batch = (int) DB::table('migrations')->max('batch') + 1;
            DB::table('migrations')->where('migration', $new)->update(['batch' => $batch]);
            $status = Artisan::call('migrate:rollback', ['--batch' => $batch, '--force' => true]);
            Conc::check('rollback '.$round.' keeps Teams and Stage1–6 task history', $status === 0
                && !Schema::hasTable('agent_organisation_policies') && Schema::hasTable('organizations')
                && Schema::hasTable('agent_channel_bindings') && $before === (array) DB::table('agent_runs')->where('id', $run['id'])->first());
            $status = Artisan::call('migrate', ['--force' => true]);
            Conc::check('reapply '.$round.' restores the organisation schema without rewriting earlier tasks', $status === 0
                && Schema::hasTable('agent_organisation_runs') && Schema::hasTable('agent_organisation_instances')
                && $before === (array) DB::table('agent_runs')->where('id', $run['id'])->first());
        }
    }
}
