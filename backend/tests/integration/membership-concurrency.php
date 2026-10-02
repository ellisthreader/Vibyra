<?php
require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\User;
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\{Wallet, Turns};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
if (DB::connection()->getConfig('host') !== '127.0.0.1' || DB::connection()->getDriverName() !== 'pgsql' || DB::connection()->getDatabaseName() !== 'vibyra_membership_qa') throw new Exception('Isolated QA database required');
config(['membership.free_enabled'=>false, 'vibes.enabled'=>true, 'vibes.daily_micro_usd_limit'=>100000000]);
function check($ok,$message) { if (!$ok) throw new Exception($message); echo "PASS $message\n"; }
function race(array $jobs): array {
    DB::disconnect(); $children=[]; $paths=[];
    $start=microtime(true)+0.2;
    foreach($jobs as $i=>$job) {
        $path=tempnam(sys_get_temp_dir(),'membership-race-'); $paths[]=$path;
        $pid=pcntl_fork();
        if($pid===0) {
            DB::purge(); while(microtime(true)<$start) usleep(1000);
            try {$job(); $r=['ok'=>true];} catch(Throwable $e) {$r=['ok'=>false,'status'=>method_exists($e,'getStatusCode')?$e->getStatusCode():null,'error'=>$e->getMessage()];}
            file_put_contents($path,json_encode($r)); exit(0);
        }
        $children[]=$pid;
    }
    foreach($children as $pid) pcntl_waitpid($pid,$status);
    DB::purge(); $results=[];
    foreach($paths as $path) {$results[]=json_decode(file_get_contents($path),true); unlink($path);}
    return $results;
}
$u=User::factory()->create(['email_verified_at'=>now(),'credits_balance'=>7]);
app(Wallet::class)->ensure($u,0);
$r=race([fn()=>app(Enrollment::class)->migrate($u,7),fn()=>app(Enrollment::class)->migrate($u,7)]);
check(count(array_filter($r,fn($v)=>$v['ok']))===2 && app(Wallet::class)->available($u->id)===70000,'concurrent migration imports once');
$p=['reference'=>'qa:'.Str::uuid(),'provider'=>'stripe','environment'=>'test','subscription_id'=>'qa_sub_'.Str::uuid(),'payment_id'=>'qa_pi','offer_key'=>'pro_monthly','starts_at'=>now(),'ends_at'=>now()->addMonth(),'units'=>3000000,'paid_minor'=>1999,'currency'=>'GBP'];
$r=race(array_fill(0,4,fn()=>app(Periods::class)->grant($u->id,$p)));
check(count(array_filter($r,fn($v)=>$v['ok']))===4 && app(Wallet::class)->available($u->id)===3070000,'four simultaneous deliveries grant once');
$v=User::factory()->create(['email_verified_at'=>now(),'credits_balance'=>0]);
app(Wallet::class)->ensure($v,0); app(Enrollment::class)->migrate($v,0);
$r=race([fn()=>app(Periods::class)->grant($u->id,[...$p,'reference'=>$p['reference'].':next']),fn()=>app(Periods::class)->grant($v->id,[...$p,'reference'=>$p['reference'].':other'])]);
check($r[0]['ok'] && !$r[1]['ok'] && $r[1]['status']===409,'subscription ownership rejects racing other account');
DB::table('vibes_wallets')->where('user_id',$u->id)->update(['consented_at'=>now()]);
$chat=(string)Str::uuid();
DB::table('vibes_chats')->insert(['id'=>$chat,'user_id'=>$u->id,'title'=>'Concurrency QA','created_at'=>now(),'updated_at'=>now()]);
$q=['unitScale'=>10000,'chatId'=>$chat,'model'=>'test','text'=>'Hi','request'=>[],'expires'=>now()->addMinute()->timestamp,'revision'=>0,'trial'=>true,'max'=>10000];
$before=app(Wallet::class)->available($u->id);
$r=race([fn()=>app(Turns::class)->submit($u->id,(string)Str::uuid(),$q),fn()=>app(Turns::class)->submit($u->id,(string)Str::uuid(),$q)]);
check(count(array_filter($r,fn($v)=>$v['ok']))===1 && app(Wallet::class)->available($u->id)===$before-10000,'racing sends reserve once');
$turn=DB::table('vibes_turns')->where('chat_id',$chat)->value('id');
$r=race(array_fill(0,3,fn()=>app(Turns::class)->settle($turn,123,'Done')));
check(count(array_filter($r,fn($v)=>$v['ok']))===3 && app(Wallet::class)->available($u->id)===$before-123,'racing settlements charge once');
$before=app(Wallet::class)->available($u->id);
$r=race(array_fill(0,3,fn()=>app(Periods::class)->refund($p['reference'].':next',1000)));
check(count(array_filter($r,fn($v)=>$v['ok']))===3 && app(Wallet::class)->available($u->id)===$before-intdiv(3000000*1000,1999),'racing refunds remove cumulative amount once');
