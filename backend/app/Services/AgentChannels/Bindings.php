<?php
namespace App\Services\AgentChannels;
use App\Models\AgentChannels\{Binding,Audience};
use App\Services\AgentRuns\{ApiError,Canonical,Grants,Runs};
use App\Services\AgentRuns\Jobs\AccountLock;
use App\Services\AgentWork\{RuntimePins};
use Illuminate\Support\Facades\{DB,Validator};
final class Bindings
{
    public function save(int $userId,string $id,array $data): array
    {
        Gate::require($userId); \App\Services\AgentRuns\Tools\Providers\Schema::only($data,['expectedRevision','identityId','audienceId','agentId','runtimeId','expectedRuntimeRevision','publicInstructions','expiresAt','ratePerHour']);
        $d=Validator::make($data,['expectedRevision'=>'required|integer|min:0','identityId'=>'required|uuid','audienceId'=>'required|uuid','agentId'=>'required|uuid',
            'runtimeId'=>'required|uuid','expectedRuntimeRevision'=>'required|integer|min:1','publicInstructions'=>'required|string|max:4000','expiresAt'=>'required|string','ratePerHour'=>'required|integer|min:1|max:12'])->validate();
        $expiry=Date::parse($d['expiresAt']); abort_unless($expiry->isFuture()&&$expiry->lte(now()->addDays(30))&&trim($d['publicInstructions'])!=='',422,'Choose public instructions and an expiry within 30 days.');
        $hash=Canonical::hash(array_diff_key($d,['expectedRevision'=>true]));
        return DB::transaction(function()use($userId,$id,$d,$hash,$expiry){
            AccountLock::force($userId); $b=Binding::where('user_id',$userId)->whereKey($id)->lockForUpdate()->first();
            if($b&&$b->request_hash===$hash&&!$b->revoked_at&&in_array($d['expectedRevision'],[$b->revision,$b->revision-1],true))return $this->payload($b);
            if(($b?->revision??0)!==$d['expectedRevision']||$b?->revoked_at)ApiError::throw(409,'channel_changed','Refresh the channel binding before saving.');
            abort_if(!$b&&Binding::whereKey($id)->exists(),404);
            $identity=app(Identities::class)->find($userId,$d['identityId']); abort_unless(app(Identities::class)->current($identity),409,'Verify the current provider account first.');
            $audience=Audience::where('user_id',$userId)->where('identity_id',$identity->id)->whereKey($d['audienceId'])->firstOrFail();
            abort_if(Binding::where('user_id',$userId)->where('identity_id',$identity->id)->where('audience_id',$audience->id)->whereNull('revoked_at')->where('id','!=',$id)->exists(),409,'That audience already has a channel agent.');
            abort_if(!$b&&Binding::where('user_id',$userId)->whereNull('revoked_at')->count()>=20,422,'Archive an old channel binding first.');
            $runtime=RuntimePins::capture($userId,$d['runtimeId']); abort_unless(($runtime['revision']??null)===$d['expectedRuntimeRevision'],409,'The selected runtime changed.');
            $selected=\App\Models\AgentV2\RuntimeBinding::findOrFail($d['runtimeId']);
            abort_unless(\App\Services\AgentRuns\Jobs\Capacity::supports($selected)&&($selected->capabilities['controlledTools']??false)===true,409,'Update the runtime before using channel agents.');
            app(Grants::class)->agent($userId,$d['agentId']);
            \App\Services\AgentOrganizations\Instances::personalOnly($d['agentId']);
            if($b)$this->cancelRuns($b);
            $b??=new Binding(['id'=>$id,'user_id'=>$userId]);
            $b->forceFill(['identity_id'=>$identity->id,'audience_id'=>$audience->id,'agent_id'=>$d['agentId'],'runtime_binding_id'=>$d['runtimeId'],
                'runtime_snapshot'=>$runtime,'public_instructions'=>$d['publicInstructions'],'revision'=>($b->revision??0)+1,'expires_at'=>$expiry,'rate_per_hour'=>$d['ratePerHour'],'request_hash'=>$hash])->save();
            return $this->payload($b);
        });
    }
    public function revoke(int $userId,string $id,int $revision): array
    {
        return DB::transaction(function()use($userId,$id,$revision){
            AccountLock::force($userId);$b=$this->find($userId,$id,true);
            if($b->revoked_at&&$b->revision===$revision+1)return $this->payload($b);
            if($b->revision!==$revision)ApiError::throw(409,'channel_changed','Refresh before revoking.');
            $this->cancelRuns($b);$b->forceFill(['revoked_at'=>now(),'revision'=>$b->revision+1])->save();return $this->payload($b);
        });
    }
    public function find(int $userId,string $id,bool $lock=false): Binding
    {
        return Binding::where('user_id',$userId)->whereKey($id)->when($lock,fn($q)=>$q->lockForUpdate())->firstOrFail();
    }
    public function current(Binding $b): bool
    {
        return !$b->revoked_at&&$b->expires_at->isFuture()&&app(Identities::class)->current(app(Identities::class)->find($b->user_id,$b->identity_id));
    }
    public function cancelRuns(Binding $b): void
    {
        foreach(DB::table('agent_channel_runs')->join('agent_runs','agent_runs.id','=','agent_channel_runs.run_id')->where('binding_id',$b->id)->whereNotIn('agent_runs.state',\App\Services\AgentRuns\RunStates::TERMINAL)->orderBy('run_id')->pluck('run_id') as $id)app(Runs::class)->cancel($b->user_id,$id);
        \App\Models\AgentChannels\InboundEvent::where('binding_id',$b->id)->where('state','pending')->update(['state'=>'cancelled']);
    }
    public function payload(Binding $b): array
    {
        $ready=$this->current($b);
        return ['id'=>$b->id,'revision'=>$b->revision,'identityId'=>$b->identity_id,'audienceId'=>$b->audience_id,
            'provider'=>app(Identities::class)->find($b->user_id,$b->identity_id)->provider,'agentId'=>$b->agent_id,'runtimeId'=>$b->runtime_binding_id,
            'runtime'=>$b->runtime_snapshot,'publicInstructions'=>$b->public_instructions,'expiresAt'=>$b->expires_at->toIso8601String(),
            'ratePerHour'=>$b->rate_per_hour,'revokedAt'=>$b->revoked_at?->toIso8601String(),'ready'=>$ready,'reason'=>$ready?null:'channel_authority_changed',
            'audience'=>app(Audiences::class)->payload(Audience::findOrFail($b->audience_id)),
            'identity'=>app(Identities::class)->payload(app(Identities::class)->find($b->user_id,$b->identity_id))];
    }
}
