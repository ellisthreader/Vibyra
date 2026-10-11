<?php
namespace Tests\Feature;
use App\Models\AgentV2\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt,DB,Http};
final class AgentChannelsOAuthTest extends \Tests\TestCase
{
    use RefreshDatabase,\Tests\Support\AgentV2Fixture,\Tests\Support\OAuthHop;
    protected function setUp(): void
    {
        parent::setUp();$this->bootV2();config(['app.url'=>'https://vibyra.test','agents_v2.channels_enabled'=>true,
            'agent_channels.slack_app_id'=>'A0123456789','agents_v2.slack_signing_secret'=>'fixture',
            'chat_connectors.catalogue.slack.oauth.client_id'=>'fixture-client','chat_connectors.catalogue.slack.oauth.client_secret'=>'fixture-secret']);
        Http::fake(['slack.com/api/oauth.v2.access'=>Http::response(['ok'=>true,'access_token'=>'fixture-bot','scope'=>'chat:write,app_mentions:read,im:history,users:read',
            'authed_user'=>['access_token'=>'fixture-human','scope'=>'users:read','id'=>'U0123456789']]),
            'slack.com/api/auth.test'=>fn($r)=>Http::response($r->header('Authorization')[0]==='Bearer fixture-human'
                ?['ok'=>true,'team'=>'Fixture','team_id'=>'T0123456789','user_id'=>'U0123456789']
                :['ok'=>true,'team'=>'Fixture','team_id'=>'T0123456789','user_id'=>'U0987654321','bot_id'=>'B0123456789']),
            'slack.com/api/bots.info*'=>Http::response(['ok'=>true,'bot'=>['app_id'=>'A0123456789']])]);
    }
    private function connect(string $role): array
    {
        $start=$this->postJson('/api/agents/v2/channels/slack/connect',['role'=>$role])->assertOk()->json();
        $query=$this->queryOf($this->openSignIn($start['url']));
        if($role==='owner'){$this->assertSame('users:read',$query['user_scope']);$this->assertArrayNotHasKey('scope',$query);}
        else{$this->assertSame('chat:write,app_mentions:read,im:history,users:read',$query['scope']);$this->assertArrayNotHasKey('user_scope',$query);}
        $this->get('/api/connectors/callback/slack?state='.$query['state'].'&code=fixture-code')->assertOk();
        return $this->getJson('/api/agents/v2/connections/flows/'.$start['flowId'])->assertOk()->assertJsonPath('status','connected')->json('connection');
    }
    public function test_explicit_owner_and_bot_oauth_create_distinct_verified_connections_without_grants(): void
    {
        $owner=$this->connect('owner');$bot=$this->connect('bot');$this->assertNotSame($owner['id'],$bot['id']);
        $this->assertSame('fixture-human',Crypt::decryptString(Connection::findOrFail($owner['id'])->credential));
        $this->assertSame('fixture-bot',Crypt::decryptString(Connection::findOrFail($bot['id'])->credential));
        $this->assertDatabaseCount('vibes_integration_installs',0);$this->assertDatabaseCount('agent_grants',0);
        $this->postJson('/api/agents/v2/channels/identities',['connectionId'=>$owner['id'],'replyConnectionId'=>$bot['id']])->assertOk()
            ->assertJsonPath('identity.actorId','U0123456789')->assertJsonPath('identity.ready',true);
        $this->postJson('/api/agents/v2/channels/identities',['connectionId'=>$bot['id'],'replyConnectionId'=>$owner['id']])->assertStatus(422);
    }
    public function test_unknown_role_disabled_feature_and_absent_server_setup_do_not_start_oauth(): void
    {
        $this->postJson('/api/agents/v2/channels/slack/connect',['role'=>'admin'])->assertUnprocessable();
        config(['agents_v2.channels_enabled'=>false]);$this->postJson('/api/agents/v2/channels/slack/connect',['role'=>'owner'])->assertStatus(503);
        config(['agents_v2.channels_enabled'=>true,'agent_channels.slack_app_id'=>null]);
        $this->postJson('/api/agents/v2/channels/slack/connect',['role'=>'bot'])->assertStatus(409)->assertJsonPath('code','provider_setup_required');
        $this->assertDatabaseCount('agent_connections',0);Http::assertNothingSent();
    }
}
