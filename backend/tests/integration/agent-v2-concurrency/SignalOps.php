<?php
use App\Services\AgentWork\Signals\{Discovery,Digests};
use Illuminate\Support\Facades\{DB,Http,Queue};
final class ConcSignalOps
{
    public static function configure():void { config(['agents_v2.work_enabled'=>true,'agents_v2.notifications'=>true,'intelligence.inbox'=>true]); Queue::fake(); }
    public static function run(array $a):array
    {
        self::configure();
        if($a['mode']==='http')return ConcHttp::call($a['method'],$a['uri'],$a['token'],$a['json']??[]);
        if($a['mode']==='digest')return ['id'=>app(Digests::class)->publish($a['user'])];
        if($a['mode']==='scan') {
            Http::swap(new \Illuminate\Http\Client\Factory);
            Http::fake(function($r)use($a){
                if($r->method()!=='GET' || !str_starts_with($r->url(),'https://api.github.com/repos/octo/app/pulls')) {
                    DB::table('conc_calls')->insert(['kind'=>'STRAY','ckey'=>'signals','pid'=>getmypid()]); return Http::response([],599);
                }
                $log=DB::table('conc_calls')->insertGetId(['kind'=>'DISCOVERY_READ','ckey'=>$a['watch'],'pid'=>getmypid()]);
                usleep((int)($a['stallMs']??150)*1000);
                DB::table('conc_calls')->where('id',$log)->update(['ended_at'=>DB::raw('clock_timestamp()')]);
                $fact=['number'=>7,'state'=>'open','merged'=>false,'merged_at'=>null,'draft'=>false,'mergeable'=>false,
                    'updated_at'=>now()->toIso8601String(),'base'=>['repo'=>['full_name'=>'octo/app']]];
                return Http::response(str_ends_with(parse_url($r->url(),PHP_URL_PATH),'/7')?$fact:[$fact]);
            });
            app(Discovery::class)->scan($a['watch']); return ['scanned'=>true];
        }
        throw new InvalidArgumentException('Unknown Signals operation.');
    }
}
