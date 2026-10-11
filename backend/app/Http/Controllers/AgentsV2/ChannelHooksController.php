<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Services\AgentChannels\{Intake,Providers\SlackInbound};
use Illuminate\Http\Request;
final class ChannelHooksController extends Controller
{
    public function slack(Request $r,SlackInbound $provider,Intake $intake)
    {
        $event=$provider->verify($r->getContent(),(string)$r->header('X-Slack-Request-Timestamp'),(string)$r->header('X-Slack-Signature'));
        return response()->json(isset($event['challenge'])?$event:$intake->accept($event));
    }
}
