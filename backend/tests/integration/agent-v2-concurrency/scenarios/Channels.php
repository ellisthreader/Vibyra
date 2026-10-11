<?php
use App\Models\AgentChannels\{Identity,InboundEvent};
use App\Models\AgentV2\{Connection,Run,ToolAction};
use App\Services\AgentChannels\{Audiences,Bindings,Intake,Admit,ReplyTool};
use Illuminate\Support\Facades\{DB,Crypt};
use Illuminate\Support\Str;
final class ConcChannels
{
    public static function run(): void
    {
        require_once __DIR__.'/../ChannelOps.php';ConcChannelOps::setup();Conc::$scenario='Stage 6 channels';$fx=ConcFixture::make(false);
        $fx['runtime']=ConcFixture::ok(ConcHttp::call('POST','/api/agents/v2/runtimes',$fx['token'],['hostId'=>$fx['hostId'],'provider'=>'claude','accountRef'=>'channel-account',
            'model'=>'sonnet','effort'=>'medium','providerVersion'=>'fixture','capabilities'=>['controlledTools'=>true,'parallelJobsV1'=>true,'workerSlots'=>3]]),201)['runtime'];
        $human=self::connection($fx,'human');$bot=self::connection($fx,'bot');
        $i=Identity::create(['user_id'=>$fx['user'],'provider'=>'slack','connection_id'=>$human->id,'connection_generation'=>1,'reply_connection_id'=>$bot->id,'reply_connection_generation'=>1,
            'workspace_id'=>'T0123456789','actor_id'=>'U0123456789','bot_id'=>'U0987654321','app_id'=>'A0123456789','label'=>'Synthetic owner','identity_hash'=>hash('sha256','fixture'.$fx['user'])]);
        $event=self::event();app(Intake::class)->accept($event);$aud=DB::table('agent_channel_audiences')->where('identity_id',$i->id)->value('id');
        $binding=app(Bindings::class)->save($fx['user'],(string)Str::uuid(),['expectedRevision'=>0,'identityId'=>$i->id,'audienceId'=>$aud,'agentId'=>$fx['agent'],
            'runtimeId'=>$fx['runtime']['id'],'expectedRuntimeRevision'=>$fx['runtime']['revision'],'publicInstructions'=>'Public fixture only.','expiresAt'=>now()->addDay()->toIso8601String(),'ratePerHour'=>12]);
        $race=Conc::tally(ConcRace::run(array_fill(0,6,['op'=>'channels','mode'=>'accept','event'=>$event])));
        Conc::check('six duplicate incoming events persist one bounded message',($race['200']??0)===6&&InboundEvent::where('binding_id',$binding['id'])->count()===1,json_encode($race));
        $e=InboundEvent::where('binding_id',$binding['id'])->sole();
        $race=Conc::tally(ConcRace::run(array_fill(0,6,['op'=>'channels','mode'=>'admit','id'=>$e->id])));$e->refresh();
        Conc::check('six admission workers create exactly one isolated run',($race['200']??0)===6&&DB::table('agent_channel_runs')->where('binding_id',$binding['id'])->count()===1&&$e->state==='admitted',json_encode($race));
        $claimed=ConcFixture::ok(ConcHttp::runner($fx,'POST','/claim',['workerSlot'=>0]),200)['run'];
        $call=['generation'=>$claimed['generation'],'callId'=>'reply','tool'=>ReplyTool::NAME,'connectionId'=>$claimed['id'],'schemaRevision'=>ReplyTool::revision(),'arguments'=>['text'=>'Public fixture reply.']];
        $a=ConcFixture::ok(ConcHttp::runner($fx,'POST','/runs/'.$claimed['id'].'/tools',$call),200)['action'];$action=ToolAction::findOrFail($a['id']);
        $race=Conc::tally(ConcRace::run(array_fill(0,6,['op'=>'channels','mode'=>'approve','user'=>$fx['user'],'id'=>$a['id'],'fingerprint'=>$action->fingerprint])));
        Conc::check('six exact approvals dispatch once outside transactions',($race['200']??0)===6&&ConcFakes::count('CHANNEL_REPLY',$a['id'])===1&&$action->fresh()->state==='completed',json_encode($race));
        Run::whereKey($claimed['id'])->update(['state'=>'completed','finished_at'=>now(),'lease_expires_at'=>null]);
        $event=self::event('EvSECOND01');app(Intake::class)->accept($event);$next=InboundEvent::where('provider_event_id','EvSECOND01')->sole();
        $jobs=[['op'=>'channels','mode'=>'admit','id'=>$next->id],['op'=>'channels','mode'=>'revoke','user'=>$fx['user'],'id'=>$binding['id'],'revision'=>1],
            ['op'=>'channels','mode'=>'runner','fx'=>$fx,'slot'=>0]];
        $race=Conc::tally(ConcRace::run($jobs));app(Admit::class)->event($next->id);
        Conc::check('admit claim and revoke race has no deadlock or surviving new task',!isset($race['500'])&&!isset($race['crash'])
            &&!Run::where('user_id',$fx['user'])->whereNotIn('state',\App\Services\AgentRuns\RunStates::TERMINAL)->exists(),json_encode($race));
        $old=InboundEvent::count();app(Intake::class)->accept(self::event('EvAFTER001'));Conc::check('revoked channel does not retain or admit another message',InboundEvent::count()===$old);
    }
    private static function connection(array $fx,string $label): Connection
    {return Connection::create(['user_id'=>$fx['user'],'provider'=>'slack','external_identity'=>$label,'credential'=>Crypt::encryptString('fixture-'.$label),'generation'=>1,'health'=>'healthy','scopes'=>[]]);}
    private static function event(string $id='EvCHANNEL1'): array
    {return ['provider'=>'slack','workspaceId'=>'T0123456789','actorId'=>'U0123456789','botIds'=>['U0987654321'],'eventId'=>$id,'kind'=>'channel','label'=>'Fixture channel','text'=>'Synthetic public request',
        'destination'=>['provider'=>'slack','workspaceId'=>'T0123456789','conversationId'=>'C0123456789','threadId'=>'1790000000.000001','activityId'=>'1790000000.000002']];}
}
