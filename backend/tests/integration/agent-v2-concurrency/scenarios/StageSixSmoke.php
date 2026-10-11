<?php
final class ConcStageSixSmoke
{
    public static function run(): void
    {
        Conc::$scenario='Stage 6 rollback smoke';conc_guard();$script=getenv('STAGE6_SMOKE_PATH');
        if(!$script||!is_file($script))throw new RuntimeException('Set STAGE6_SMOKE_PATH to the reviewed rollback-only script.');
        $p=new Symfony\Component\Process\Process([PHP_BINARY,$script,base_path(),'--rollback-only'],base_path(),null,null,120);$p->run();
        $result=json_decode($p->getOutput(),true);file_put_contents(getenv('STAGE6_SMOKE_RESULT')?:sys_get_temp_dir().'/stage6-smoke.json',$p->getOutput());
        Conc::check('rollback-only service smoke passes all checks without external HTTP',$p->isSuccessful()&&is_array($result)&&$result['rolledBack']&&$result['outboundHttp']===0&&!$result['error'],
            $result['error']??$p->getErrorOutput());
    }
}
