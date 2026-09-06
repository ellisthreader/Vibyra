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
$rows=[];
foreach([1,10,40] as $count){$threads=[];for($t=0;$t<$count;$t++){$messages=[];for($m=0;$m<80;$m++)$messages[]=['id'=>'m'.$m,'role'=>$m%2?'assistant':'user','text'=>str_repeat('synthetic audit text ',100)];$threads['t'.$t]=$messages;}
 $state=['detachedChatThreads'=>$threads,'projectMemories'=>[]];$user->forceFill(['app_state'=>$state])->save();$body=json_encode(['appState'=>$state]);
 foreach(['session'=>['/api/session','GET',null],'save'=>['/api/session/state','POST',$body]] as $name=>$spec){requestSample(...[...$spec,$token]);$samples=[];for($i=0;$i<12;$i++)$samples[]=requestSample(...[...$spec,$token]);$rows[]=statRow($name,$samples,['threads'=>$count,'payloadBytes'=>strlen($body)]);}
 $samples=[];for($i=0;$i<12;$i++){ $changed=$state; $changed['detachedChatTitles']=['t0'=>'revision-'.$i]; $samples[]=requestSample('/api/session/state','POST',json_encode(['appState'=>$changed]),$token); } $rows[]=statRow('save-changing',$samples,['threads'=>$count,'payloadBytes'=>strlen($body)]);}
$user->forceFill(['app_state'=>[]])->save();
foreach([1,10,50] as $count){App\Models\PublishedProject::query()->delete();for($i=0;$i<$count;$i++)App\Models\PublishedProject::create(['user_id'=>$user->id,'source_project_id'=>'fixture'.$i,'slug'=>'fixture'.$i,'title'=>'Audit Fixture '.$i,'description'=>'Synthetic local benchmark only','visibility'=>'public','review_status'=>App\Models\PublishedProject::REVIEW_APPROVED,'published_at'=>now(),'preview_html'=>'<!doctype html><h1>Audit</h1>']);
 requestSample('/api/community/projects');$samples=[];for($i=0;$i<12;$i++)$samples[]=requestSample('/api/community/projects');$rows[]=statRow('community',$samples,['projects'=>$count]);}
file_put_contents($out.'/backend-bench.json',json_encode(['kind'=>'Warm in-process Laravel kernel, synthetic in-memory SQLite, not production network latency','rows'=>$rows,'peakMemoryBytes'=>memory_get_peak_usage(true)],JSON_PRETTY_PRINT));
echo file_get_contents($out.'/backend-bench.json'),"\n";
