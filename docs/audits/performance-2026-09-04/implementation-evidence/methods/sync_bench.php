<?php
$root='/home/ellis/Desktop/Vibyra/backend';
$out=__DIR__;
foreach(['APP_ENV'=>'testing','DB_CONNECTION'=>'sqlite','DB_DATABASE'=>':memory:','DB_URL'=>'','CACHE_STORE'=>'array','SESSION_DRIVER'=>'array','MAIL_MAILER'=>'array','QUEUE_CONNECTION'=>'sync','BCRYPT_ROUNDS'=>'4','APP_CONFIG_CACHE'=>$out.'/nonexistent-config.php','LOG_CHANNEL'=>'stderr'] as $key=>$value){putenv("$key=$value");$_ENV[$key]=$value;$_SERVER[$key]=$value;}
require $root.'/vendor/autoload.php';
$app=require $root.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Artisan::call('migrate',['--force'=>true]);
$user=App\Models\User::factory()->create(['name'=>'Audit Fixture','email'=>'audit@example.invalid','password'=>'audit-test-password','plan'=>'free']);
$token='synthetic-audit-token';
App\Models\VibyraSession::create(['user_id'=>$user->id,'token_hash'=>hash('sha256',$token),'device_name'=>'Audit','last_used_at'=>now(),'idle_expires_at'=>now()->addHour(),'absolute_expires_at'=>now()->addDay()]);
$kernel=$app->make(Illuminate\Contracts\Http\Kernel::class);
function requestSample($uri,$method='GET',$body=null,$token=null){global $kernel;
 $server=['HTTP_ACCEPT'=>'application/json','CONTENT_TYPE'=>'application/json','REMOTE_ADDR'=>'127.0.0.1'];if($token)$server['HTTP_AUTHORIZATION']='Bearer '.$token;
 $request=Illuminate\Http\Request::create($uri,$method,[],[],[],$server,$body);
 Illuminate\Support\Facades\DB::flushQueryLog();Illuminate\Support\Facades\DB::enableQueryLog();
 $start=hrtime(true);$response=$kernel->handle($request);$text=$response->getContent();$time=(hrtime(true)-$start)/1e6;
 $queries=Illuminate\Support\Facades\DB::getQueryLog();Illuminate\Support\Facades\DB::disableQueryLog();$kernel->terminate($request,$response);
 if($response->getStatusCode()!==200)throw new RuntimeException('Unexpected status '.$response->getStatusCode().' at '.$uri);
 return ['ms'=>$time,'bytes'=>strlen($text),'queries'=>count($queries),'sqlMs'=>array_sum(array_column($queries,'time')),'selects'=>count(array_filter($queries,fn($q)=>str_starts_with(strtolower($q['query']),'select')))];
}
function statRow($name,$samples,$extra=[]){$xs=array_column($samples,'ms');sort($xs);return ['case'=>$name,'samples'=>count($xs),'p50ms'=>$xs[(int)ceil(count($xs)*.5)-1],'p95ms'=>$xs[(int)ceil(count($xs)*.95)-1],'bytes'=>$samples[0]['bytes'],'queries'=>$samples[0]['queries'],...$extra];}

$rows=[];$threads=[];
for($t=0;$t<40;$t++){ $messages=[];for($m=0;$m<80;$m++)$messages[]=['id'=>'m'.$m,'role'=>$m%2?'assistant':'user','text'=>str_repeat('synthetic audit text ',100)];$threads['t'.$t]=$messages; }
$state=['detachedChatThreads'=>$threads,'projectMemories'=>[]];
foreach(['legacy-full','compact-full','delta'] as $mode){
 $user=$user->fresh(); $user->forceFill(['app_state'=>$state])->save(); $previous=$state['detachedChatThreads']['t0'][79]['text'];$samples=[];$requestSizes=[];
 for($i=0;$i<21;$i++){
  $next=$state['detachedChatThreads']['t0'][79]['text'].' revision-'.$i;
  if($mode==='delta'){$uri='/api/session/state/delta';$payload=['syncVersion'=>1,'changes'=>[
   ['path'=>['appState','detachedChatThreads','t0','79','id'],'beforePresent'=>true,'before'=>'m79','remove'=>false,'value'=>'m79'],
   ['path'=>['appState','detachedChatThreads','t0','79','text'],'beforePresent'=>true,'before'=>$previous,'remove'=>false,'value'=>$next]
  ]];}else{$uri='/api/session/state';$changed=$state;$changed['detachedChatThreads']['t0'][79]['text']=$next;$payload=['appState'=>$changed];if($mode==='compact-full')$payload['responseMode']='ack-v1';}
  $body=json_encode($payload);$sample=requestSample($uri,'POST',$body,$token);if($i>0){$samples[]=$sample;$requestSizes[]=strlen($body);}$previous=$next;
 }
 $rows[]=statRow($mode,$samples,['requestBytes'=>$requestSizes[0],'raw'=>$samples]);
 if($user->fresh()->app_state['detachedChatThreads']['t0'][79]['text']!==$previous)throw new RuntimeException('Final text was lost');
}
file_put_contents($out.'/sync-bench.json',json_encode(['kind'=>'Warm local Laravel kernel; synthetic 40 x 80 messages; memory SQLite; 1 warmup + 20 changes per mode','rows'=>$rows,'peakMemoryBytes'=>memory_get_peak_usage(true)],JSON_PRETTY_PRINT));
echo 'Sync benchmark passed',PHP_EOL;
