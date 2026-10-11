<?php
namespace Tests\Feature;
use App\Models\AgentChannels\{Binding,InboundEvent};
use App\Models\AgentV2\{Connection,Run};
use App\Services\AgentChannels\{Bindings,Identities,Intake,Admit,ReplyTool};
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\{Crypt,DB,Http,Queue};
use Illuminate\Support\Str;
abstract class AgentChannelsTestCase extends \Tests\TestCase
{
    use \Tests\Support\AgentV2Fixture,\Tests\Support\AgentV2Routes,\Tests\Support\AgentCoordinationFixture;
    protected array $identity;protected array $binding;protected Connection $human;protected Connection $bot;
    protected function setUp(): void
    {
        parent::setUp();$this->artisan("migrate:fresh", ["--force"=>true])->assertExitCode(0);$this->bootV2();$this->coordinationRuntime();Queue::fake();
        config(['agents_v2.coordination_enabled'=>false,'agents_v2.parallel_jobs_enabled'=>false,'agents_v2.channels_enabled'=>true,
            'agent_channels.slack_app_id'=>'A0123456789','agents_v2.slack_signing_secret'=>'fixture-signing-secret']);
        $this->human=$this->connection('slack','human-token');$this->bot=$this->connection('slack','bot-token');
        $this->route('GET','#slack.com/api/auth.test#',fn($r)=>Http::response(str_contains($r->header('Authorization')[0],'human-token')
            ?['ok'=>true,'team_id'=>'T0123456789','user_id'=>'U0123456789','user'=>'Fixture owner','team'=>'Fixture workspace']
            :['ok'=>true,'team_id'=>'T0123456789','user_id'=>'U0987654321','bot_id'=>'B0123456789']));
        $this->route('GET','#slack.com/api/bots.info#',Http::response(['ok'=>true,'bot'=>['app_id'=>'A0123456789']]));
        $this->identity=app(Identities::class)->verify($this->user->id,$this->human->id,$this->bot->id);
        app(Intake::class)->accept($this->envelope('EvDISCOVER1'));
        $audience=DB::table('agent_channel_audiences')->value('id');
        $this->binding=app(Bindings::class)->save($this->user->id,(string)Str::uuid(),['expectedRevision'=>0,'identityId'=>$this->identity['id'],
            'audienceId'=>$audience,'agentId'=>$this->agent['id'],'runtimeId'=>$this->runtime['id'],'expectedRuntimeRevision'=>$this->runtime['revision'],
            'publicInstructions'=>'Only answer questions about the public project.','expiresAt'=>now()->addDay()->toIso8601String(),'ratePerHour'=>12]);
    }
    protected function connection(string $provider,string $token): Connection
    {
        return Connection::create(['user_id'=>$this->user->id,'provider'=>$provider,'external_identity'=>$token,
            'credential'=>Crypt::encryptString($token),'generation'=>1,'health'=>'healthy','scopes'=>[]]);
    }
    protected function envelope(string $id='EvMESSAGE01',string $text='Summarize the public release.'): array
    {
        return ['provider'=>'slack','workspaceId'=>'T0123456789','actorId'=>'U0123456789','botIds'=>['U0987654321'],'eventId'=>$id,'kind'=>'channel',
            'label'=>'Fixture channel','text'=>$text,'destination'=>['provider'=>'slack','workspaceId'=>'T0123456789','conversationId'=>'C0123456789','threadId'=>'1790000000.000001','activityId'=>'1790000000.000002']];
    }
    protected function startChannel(string $id='EvMESSAGE01'): array
    {
        app(Intake::class)->accept($this->envelope($id));$event=InboundEvent::where('provider_event_id',$id)->firstOrFail();app(Admit::class)->event($event->id);
        $this->assertSame('admitted',$event->fresh()->state);
        return $this->postJson($this->runnerPath('/claim'),['workerSlot'=>0],$this->runnerHeaders())->assertOk()->json('run');
    }
    protected function reply(array $run,string $id='reply-1'): array
    {
        return $this->postJson($this->runnerPath('/runs/'.$run['id'].'/tools'),['generation'=>$run['generation'],'callId'=>$id,
            'tool'=>ReplyTool::NAME,'connectionId'=>$run['id'],'schemaRevision'=>ReplyTool::revision(),'arguments'=>['text'=>'The public release is ready.']],$this->runnerHeaders())
            ->assertOk()->assertJsonPath('action.state','pending_approval')->json('action');
    }
    protected function signedSlack(array $body,string $path='/api/agents/v2/channel-hooks/slack',bool $valid=true)
    {
        $raw=json_encode($body);$time=(string)time();return $this->call('POST',$path,[],[],[],['CONTENT_TYPE'=>'application/json',
            'HTTP_X_SLACK_REQUEST_TIMESTAMP'=>$time,'HTTP_X_SLACK_SIGNATURE'=>'v0='.hash_hmac('sha256','v0:'.$time.':'.$raw,$valid?'fixture-signing-secret':'bad')],$raw);
    }
    protected function slackBody(): array
    {
        return ['type'=>'event_callback','api_app_id'=>'A0123456789','team_id'=>'T0123456789','event_id'=>'EvSIGNED01',
            'authorizations'=>[['is_bot'=>true,'user_id'=>'U0987654321']],
            'event'=>['type'=>'app_mention','user'=>'U0123456789','channel'=>'C0123456789','text'=>'Public question','ts'=>'1790000000.000002','thread_ts'=>'1790000000.000001']];
    }
}
