<?php
namespace App\Services\AgentChannels\Providers;
use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\Connections\Credentials;
use App\Services\AgentRuns\Tools\Providers\SlackApi;
final class IdentityProbe
{
    public function verify(Connection $connection, ?Connection $reply): array
    {
        \App\Services\AgentChannels\Gate::provider($connection->provider);
        $token = app(Credentials::class)->for($connection);
        if ($connection->provider === 'slack') {
            abort_unless($reply && $reply->provider === 'slack',422,'Select a separate Slack bot connection for replies.');
            $human = SlackApi::get($token,'auth.test',[]);
            $botToken = app(Credentials::class)->for($reply); $bot = SlackApi::get($botToken,'auth.test',[]);
            abort_unless(empty($human['bot_id']) && !empty($bot['bot_id']) && ($human['team_id']??null) === ($bot['team_id']??null),422,'Verify your human Slack account and the bot in the same workspace.');
            $info = SlackApi::get($botToken,'bots.info',['bot'=>$bot['bot_id']]);
            abort_unless(($info['bot']['app_id']??null) === config('agent_channels.slack_app_id'),422,'That bot belongs to a different Slack app.');
            foreach (['team_id'=>'/^T[A-Z0-9]{5,30}$/D','user_id'=>'/^[UW][A-Z0-9]{5,30}$/D'] as $field=>$pattern)
                abort_unless(is_string($human[$field]??null) && preg_match($pattern,$human[$field]),422,'Slack did not verify the account identity.');
            abort_unless(is_string($bot['user_id']??null) && preg_match('/^[UW][A-Z0-9]{5,30}$/D',$bot['user_id']),422);
            return ['app_id'=>config('agent_channels.slack_app_id'),'workspace_id'=>$human['team_id'],'actor_id'=>$human['user_id'],'bot_id'=>$bot['user_id'],
                'label'=>mb_substr((string)($human['user']??$human['user_id']).' · '.(string)($human['team']??$human['team_id']),0,180)];
        }
        abort(410, 'This integration has been removed.');
    }
}
