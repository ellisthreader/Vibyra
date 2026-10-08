<?php

use Illuminate\Support\Facades\{Artisan, DB, Schema};

/** Only the guarded disposable PostgreSQL database may exercise migration reversal. */
final class ConcStageFourUpgrade
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage 4 migration upgrade'; conc_guard();
        $new = ['2026_10_09_010000_create_agent_work', '2026_10_09_020000_add_agent_signals', '2026_10_09_030000_create_agent_work_proposals'];
        if (DB::table('migrations')->whereIn('migration', $new)->count() !== 3) throw new RuntimeException('All three Stage 4 migrations are required.');
        config(['agents_v2.work_enabled' => false]);
        $fx = ConcFixture::make(true); ConcFixture::admit($fx, 'Prepare a pending upgrade fixture.'); $run = ConcFixture::claim($fx);
        $action = ConcFixture::write($fx, $run, ['to' => 'fixture@example.test', 'subject' => 'Migration', 'body' => 'Do not send.'], 'stage4-upgrade');
        app(\App\Services\Notifications\Preferences::class)->get($fx['user']);
        DB::table('notification_preferences')->where('user_id', $fx['user'])->update(['timezone' => 'Europe/London', 'quiet_start' => 1320, 'quiet_end' => 420]);
        $before = self::snapshot($fx, $run, $action);
        $baseline = DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson();
        for ($round = 1; $round <= 2; $round++) {
            $batch = (int) DB::table('migrations')->max('batch') + 1;
            DB::table('migrations')->whereIn('migration', $new)->update(['batch' => $batch]);
            if (DB::table('migrations')->where('batch', $batch)->count() !== 3) throw new RuntimeException('Unexpected migration batch.');
            $status = Artisan::call('migrate:rollback', ['--batch' => $batch, '--force' => true]);
            Conc::check('rollback '.$round.' preserves existing task, approval and notification preferences', $status === 0
                && !Schema::hasTable('agent_work_goals') && !Schema::hasTable('agent_work_proposals')
                && !Schema::hasTable('agent_run_skill_snapshots') && !Schema::hasColumn('notification_preferences', 'agent_mode')
                && self::snapshot($fx, $run, $action) === $before
                && DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson() === $baseline);
            $status = Artisan::call('migrate', ['--force' => true]);
            Conc::check('upgrade '.$round.' adds three slices with compatible notification defaults', $status === 0
                && Schema::hasTable('agent_work_goals') && Schema::hasTable('agent_work_followups')
                && Schema::hasTable('agent_work_proposals') && Schema::hasTable('agent_run_skill_snapshots')
                && Schema::hasTable('agent_signal_watches') && Schema::hasTable('agent_signal_digests')
                && DB::table('notification_preferences')->where('user_id', $fx['user'])->value('agent_mode') === 'all'
                && self::snapshot($fx, $run, $action) === $before
                && DB::table('migrations')->whereNotIn('migration', $new)->orderBy('id')->get()->toJson() === $baseline);
        }
        Conc::check('pending provider write was never dispatched during upgrade', ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']) === 0);
        config(['agents_v2.work_enabled' => true]);
    }

    private static function snapshot(array $fx, array $run, array $action): array
    {
        return [(array) DB::table('agent_runs')->where('id', $run['id'])->first(['id', 'prompt', 'state', 'runtime_snapshot', 'grant_snapshot']),
            (array) DB::table('agent_tool_actions')->where('id', $action['id'])->first(['id', 'arguments', 'fingerprint', 'state', 'dispatched_at']),
            (array) DB::table('notification_preferences')->where('user_id', $fx['user'])->first(['revision', 'timezone', 'quiet_start', 'quiet_end', 'attention', 'replies'])];
    }
}
