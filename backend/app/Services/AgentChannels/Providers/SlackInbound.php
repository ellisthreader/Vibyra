<?php
namespace App\Services\AgentChannels\Providers;
use App\Services\AgentChannels\Gate;
use App\Services\AgentTriggers\SlackEvents;
final class SlackInbound
{
    public function verify(string $raw,string $timestamp,string $signature): array
    {
        Gate::provider('slack'); abort_if(strlen($raw)>65536,413); app(SlackEvents::class)->verify($raw,$timestamp,$signature);
        $body=json_decode($raw,true,32);abort_unless(is_array($body),422);
        if(($body['type']??null)==='url_verification') {
            abort_unless(is_string($body['challenge']??null)&&strlen($body['challenge'])<=500,422);return ['challenge'=>$body['challenge']];
        }
        if(($body['api_app_id']??null)!==config('agent_channels.slack_app_id'))abort(403,'Wrong Slack application.');
        if(($body['type']??null)!=='event_callback')return [];
        $e=$body['event']??[];if(!is_array($e)||isset($e['bot_id'])||isset($e['subtype']))return [];
        $dm=($e['type']??null)==='message'&&($e['channel_type']??null)==='im';
        if(!$dm&&($e['type']??null)!=='app_mention')return [];
        foreach(['event_id'=>'/^Ev[A-Za-z0-9]{4,38}$/D','team_id'=>'/^T[A-Z0-9]{5,30}$/D'] as $k=>$p)if(!is_string($body[$k]??null)||!preg_match($p,$body[$k]))return [];
        foreach(['user'=>'/^[UW][A-Z0-9]{5,30}$/D','channel'=>'/^[CGD][A-Z0-9]{5,30}$/D','ts'=>'/^\d{9,11}\.\d{6}$/D'] as $k=>$p)if(!is_string($e[$k]??null)||!preg_match($p,$e[$k]))return [];
        $thread=$e['thread_ts']??$e['ts'];if(!is_string($thread)||!preg_match('/^\d{9,11}\.\d{6}$/D',$thread)||!is_string($e['text']??null)||trim($e['text'])===''||mb_strlen($e['text'])>4000)return [];
        $bots=[];foreach(array_slice((array)($body['authorizations']??[]),0,10) as $a)if(is_array($a)&&($a['is_bot']??false)===true&&is_string($a['user_id']??null))$bots[]=$a['user_id'];
        if(!$bots)return [];
        return ['provider'=>'slack','workspaceId'=>$body['team_id'],'actorId'=>$e['user'],'botIds'=>$bots,'eventId'=>$body['event_id'],
            'kind'=>$dm?'dm':'channel','label'=>($dm?'Direct message ':'Slack channel ').$e['channel'],'text'=>$e['text'],
            'destination'=>['provider'=>'slack','workspaceId'=>$body['team_id'],'conversationId'=>$e['channel'],'threadId'=>$thread,'activityId'=>$e['ts']]];
    }
}
