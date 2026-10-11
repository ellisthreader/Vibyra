<?php
namespace App\Services\AgentChannels\Providers;
use App\Models\AgentChannels\Identity;
use App\Models\AgentV2\{Connection,ToolAction};
use App\Services\AgentRuns\Connections\Credentials;
use App\Services\AgentRuns\Tools\Providers\{SlackApi,ToolFailure};
final class ReplySender
{
    public function send(Identity $identity,array $destination,ToolAction $action): array
    {
        if($identity->provider==='slack' && ($destination['provider'] ?? null)==='slack'){
            $c=Connection::where('user_id',$identity->user_id)->whereKey($identity->reply_connection_id)->where('generation',$identity->reply_connection_generation)->firstOrFail();
            $token=app(Credentials::class)->for($c);
            $result=SlackApi::post($token,'chat.postMessage',['channel'=>$destination['conversationId'],'thread_ts'=>$destination['threadId'],
                'text'=>$action->arguments['text'],'mrkdwn'=>false,'parse'=>'none','unfurl_links'=>false,'unfurl_media'=>false,
                'metadata'=>['event_type'=>'vibyra_channel_reply','event_payload'=>['action'=>$action->id]]]);
            if(($result['channel']??null)!==$destination['conversationId']||!is_string($result['ts']??null)||!preg_match('/^\d{9,11}\.\d{6}$/D',$result['ts']))throw ToolFailure::unknown('Slack');
            return ['id'=>$result['ts'],'provider'=>'slack','conversationId'=>$destination['conversationId'],'threadId'=>$destination['threadId']];
        }
        throw ToolFailure::refused('provider_removed', 'This integration has been removed.');
    }
}
