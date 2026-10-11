<?php
use Illuminate\Support\Facades\{Artisan,DB,Schema};
final class ConcStageSixUpgrade
{
    public static function run(): void
    {
        Conc::$scenario='Stage 6 migration upgrade';conc_guard();
        $new=['2026_10_09_060000_create_agent_channels','2026_10_09_070000_create_agent_capability_installations','2026_10_09_080000_create_agent_browser_files',
            '2026_10_09_090000_create_browser_access_versions','2026_10_09_100000_create_browser_workflows'];
        if(DB::table('migrations')->whereIn('migration',$new)->count()!==5)throw new RuntimeException('Stage 6 migration inventory changed.');
        config(['agents_v2.channels_enabled'=>false,'agents_v2.capabilities_enabled'=>false,'agents_v2.browser_workflows_enabled'=>false,'agents_v2.parallel_jobs_enabled'=>false]);
        $fx=ConcFixture::make(true);ConcFixture::admit($fx,'Preserve previous stage pending write.');$run=ConcFixture::claim($fx);
        $action=ConcFixture::write($fx,$run,['to'=>'fixture@example.invalid','subject'=>'Migration proof','body'=>'Never send.'],'stage6-upgrade');
        $snapshot=fn()=>[(array)DB::table('agent_runs')->where('id',$run['id'])->first(),(array)DB::table('agent_tool_actions')->where('id',$action['id'])->first()];
        $before=$snapshot();$old=DB::table('migrations')->whereNotIn('migration',$new)->orderBy('id')->get()->toJson();
        foreach([1,2]as$round){
            $batch=(int)DB::table('migrations')->max('batch')+1;DB::table('migrations')->whereIn('migration',$new)->update(['batch'=>$batch]);
            $status=Artisan::call('migrate:rollback',['--batch'=>$batch,'--force'=>true]);
            Conc::check('rollback '.$round.' preserves Stage5 schema task and pending exact write',$status===0&&!Schema::hasTable('agent_channel_bindings')&&!Schema::hasTable('agent_browser_workflows')
                &&Schema::hasTable('agent_run_jobs')&&Schema::hasTable('agent_workflows')&&$snapshot()===$before&&DB::table('migrations')->whereNotIn('migration',$new)->orderBy('id')->get()->toJson()===$old);
            $status=Artisan::call('migrate',['--force'=>true]);
            Conc::check('upgrade '.$round.' adds all Stage6 tables while preserving earlier data',$status===0&&Schema::hasTable('agent_channel_runs')&&Schema::hasTable('agent_capability_installations')
                &&Schema::hasTable('agent_browser_files')&&Schema::hasTable('agent_browser_access_versions')&&Schema::hasTable('agent_browser_workflow_tests')&&$snapshot()===$before
                &&DB::table('migrations')->whereNotIn('migration',$new)->orderBy('id')->get()->toJson()===$old);
        }
        Conc::check('migration proof never sent the older pending write',ConcFakes::count('GMAIL_SEND','tok-'.$fx['user'])===0);
    }
}
