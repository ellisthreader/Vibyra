<?php
require __DIR__.'/../../../vendor/autoload.php';
$app=require __DIR__.'/../../../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\{DB,Http,Artisan};
use Illuminate\Support\Str;
use App\Models\{User,VibyraSession};
use App\Services\Assistant\Budget;
use App\Services\Vibes\Wallet;
use App\Services\Membership\Enrollment;
if(DB::connection()->getDriverName()!=='pgsql'||DB::connection()->getDatabaseName()!=='vibyra_assistant_qa'||DB::connection()->getConfig('host')!=='127.0.0.1')throw new Exception('Disposable QA database required');
config(['assistant.enabled'=>true,'assistant.month_micro_usd'=>300000,'assistant.concurrent_calls'=>4,
 'assistant.user_minute_calls'=>1000,'assistant.user_day_calls'=>1000,'membership.free_enabled'=>false,
 'membership.enabled'=>false,'vibes.daily_micro_usd_limit'=>100000000,'legal.enforce_market_access'=>false]);
Http::preventStrayRequests();
$users=[];
for($i=0;$i<4;$i++){
 $u=User::factory()->create(['email_verified_at'=>now(),'credits_balance'=>0]);
 app(Wallet::class)->ensure($u,0);app(Enrollment::class)->migrate($u,0);
 app(Wallet::class)->grant($u->id,'load-funds-'.$i,'topup',1000000);
 $token=bin2hex(random_bytes(32));VibyraSession::create(['user_id'=>$u->id,'token_hash'=>hash('sha256',$token),'last_used_at'=>now()]);
 $users[]=['id'=>$u->id,'token'=>$token];
}
function check(bool $ok,string $label):void{if(!$ok)throw new Exception($label);echo "PASS: $label\n";}
function requestChat(string $token,string $id):int{
 global $app;
 $r=Illuminate\Http\Request::create('/api/assistant/chat','POST',[],[],[],
  ['CONTENT_TYPE'=>'application/json','HTTP_ACCEPT'=>'application/json','HTTP_AUTHORIZATION'=>'Bearer '.$token],
  json_encode(['requestId'=>$id,'messages'=>[['role'=>'user','content'=>'Synthetic bounded load reply.']]]));
 $response=$app->make(Illuminate\Contracts\Http\Kernel::class)->handle($r);
 if($response instanceof Symfony\Component\HttpFoundation\StreamedResponse){ob_start();$response->sendContent();ob_end_clean();}
 return $response->getStatusCode();
}
$paths=[];$children=[];$start=microtime(true);DB::disconnect();
foreach([7,0,1,2,3,4,5,6] as $worker){
 $path=tempnam(sys_get_temp_dir(),'assistant-load-');$paths[]=$path;$pid=pcntl_fork();
 if($pid===0){
  DB::purge();$u=$users[$worker%4];$calls=0;
  Http::fake(['https://api.openai.com/*'=>function()use(&$calls){
   $calls++;if($calls%3===0)usleep(100000);
   if($calls%5===0)return Http::response(['error'=>'synthetic provider failure'],503);
   if($calls%7===0)return Http::response("data: {\"choices\":[]}\n\n",200,['Content-Type'=>'text/event-stream']);
   return Http::response("data: {\"choices\":[],\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":5}}\n\ndata: [DONE]\n\n",200,['Content-Type'=>'text/event-stream']);
  }]);
  if($worker===7){
   app(Budget::class)->reserve($u['id'],(string)Str::uuid(),'chat',3500);
   file_put_contents($path,json_encode(['killedAfterDurableHold'=>true]));posix_kill(getmypid(),SIGKILL);exit(9);
  }
  $counts=[];$duplicates=0;
  for($turn=0;$turn<80;$turn++){
   $id=(string)Str::uuid();$status=requestChat($u['token'],$id);$counts[$status]=($counts[$status]??0)+1;
   if(!in_array($status,[200,429,502,503],true))throw new Exception('Unexpected HTTP status '.$status);
   if($turn%10===0&&in_array($status,[200,502],true)){if(requestChat($u['token'],$id)!==409)throw new Exception('Duplicate accepted');$duplicates++;}
   usleep(500000);
  }
  file_put_contents($path,json_encode(['statuses'=>$counts,'duplicates'=>$duplicates,'providerCalls'=>$calls]));exit(0);
 }
 $children[$pid]=$worker;
 if($worker===7){$until=microtime(true)+5;do{clearstatcache(true,$path);if(filesize($path)>0)break;usleep(10000);}while(microtime(true)<$until);if(filesize($path)===0)throw new Exception('Killed-worker hold not committed');}
}
$killed=0;foreach($children as $pid=>$worker){pcntl_waitpid($pid,$status);if($worker===7){check(pcntl_wifsignaled($status)&&pcntl_wtermsig($status)===SIGKILL,'worker was killed after committing its hold');$killed++;}else check(pcntl_wifexited($status)&&pcntl_wexitstatus($status)===0,'HTTP workload worker '.$worker.' completed');}
DB::purge();$receipts=[];foreach($paths as $path){$receipts[]=json_decode(file_get_contents($path),true);unlink($path);}
check(DB::table('assistant_requests')->where('state','reserved')->count()===1,'only killed worker leaves an outstanding reservation');
DB::table('assistant_requests')->where('state','reserved')->update(['created_at'=>now()->subMinutes(6)]);
Artisan::call('vibyra:recover-assistant');Artisan::call('vibyra:recover-assistant');
check(DB::table('assistant_requests')->where('state','reserved')->count()===0,'recovery settles killed worker once');
foreach($users as $i=>$u){$charged=(int)DB::table('assistant_requests')->where('user_id',$u['id'])->sum('charged_units');check(app(Wallet::class)->available($u['id'])===1000000-$charged,'account '.$i.' balance matches only its own charges');}
$requests=DB::table('assistant_requests')->count();$spent=(int)DB::table('assistant_requests')->sum('charged_micro_usd');
check($spent<=300000&&(int)DB::table('assistant_buckets')->where('id','like','month:%')->sum('micro_usd')===$spent,'global operator budget has no overshoot');
check((int)DB::table('vibes_spend_days')->sum('held')===0&&(int)DB::table('vibes_spend_days')->sum('spent')===$spent,'shared daily holds are zero and costs reconcile');
check(DB::table('vibes_ledger')->where('kind','assistant_hold')->count()===$requests&&DB::table('vibes_ledger')->where('kind','assistant_settlement')->count()===$requests,'each admitted request has one hold and settlement');
check(DB::table('vibes_grants')->where('remaining','<',0)->count()===0,'no account grant is negative');
$complete=DB::table('assistant_requests')->where('state','complete')->count();$uncertain=DB::table('assistant_requests')->where('state','uncertain')->count();
check($complete>10&&$uncertain>1,'successful, failed and interrupted provider outcomes were exercised');
$duration=microtime(true)-$start;
echo json_encode(['workers'=>8,'attemptedHttpCalls'=>560,'admitted'=>$requests,'complete'=>$complete,'uncertain'=>$uncertain,'providerRiskMicroUsd'=>$spent,'seconds'=>round($duration,3),'workerReceipts'=>$receipts,'scope'=>'isolated bounded fault workload; not production throughput capacity'])."\n";
