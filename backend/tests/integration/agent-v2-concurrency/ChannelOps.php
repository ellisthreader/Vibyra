<?php
use Illuminate\Support\Facades\{DB,Http,Queue};
final class ConcChannelOps
{
    public static function setup(): void
    {
        config(['agents_v2.channels_enabled'=>true,'agent_channels.slack_app_id'=>'A0123456789','agents_v2.slack_signing_secret'=>'fixture-signing-secret']);Queue::fake();
    }
    public static function run(array $a): array
    {
        self::setup();
        if($a['mode']==='approve'){
            Http::swap(new \Illuminate\Http\Client\Factory());Http::preventStrayRequests();Http::fake(function($r){
                if($r->method()==='POST'&&$r->url()==='https://slack.com/api/chat.postMessage'){
                    if(DB::transactionLevel()!==0)throw new RuntimeException('Provider call inside outer transaction');
                    DB::table('conc_calls')->insert(['kind'=>'CHANNEL_REPLY','ckey'=>$r['metadata']['event_payload']['action'],'pid'=>getmypid()]);
                    usleep(150000);return Http::response(['ok'=>true,'channel'=>$r['channel'],'ts'=>'1790000001.000001']);
                }DB::table('conc_calls')->insert(['kind'=>'STRAY','ckey'=>$r->url(),'pid'=>getmypid()]);return Http::response([],599);
            });
        }
        $result=match($a['mode']){
            'accept'=>app(\App\Services\AgentChannels\Intake::class)->accept($a['event']),
            'admit'=>app(\App\Services\AgentChannels\Admit::class)->event($a['id']),
            'revoke'=>app(\App\Services\AgentChannels\Bindings::class)->revoke($a['user'],$a['id'],$a['revision']),
            'approve'=>app(\App\Services\AgentRuns\Tools\Approvals::class)->decide($a['user'],$a['id'],$a['fingerprint'],'allow')->state,
            'runner'=>ConcHttp::runner($a['fx'],'POST','/claim',['workerSlot'=>$a['slot']]),
            default=>throw new InvalidArgumentException('Unknown channel op'),
        };return ['status'=>200,'json'=>$result??[]];
    }
}
