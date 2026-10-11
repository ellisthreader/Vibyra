<?php
namespace App\Services\AgentChannels;
use App\Models\AgentChannels\Identity;
use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\{ApiError,Canonical};
use App\Services\AgentRuns\Jobs\AccountLock;
use Illuminate\Support\Facades\DB;
final class Identities
{
    public function verify(int $userId, string $connectionId, ?string $replyId): array
    {
        Gate::require($userId); $c=$this->connection($userId,$connectionId); $r=$replyId?$this->connection($userId,$replyId):null;
        Gate::provider($c->provider); $proof=app(Providers\IdentityProbe::class)->verify($c,$r);
        return DB::transaction(function () use ($userId,$c,$r,$proof) {
            AccountLock::force($userId); $this->unchanged($c); if($r)$this->unchanged($r);
            $hash=Canonical::hash([$c->id,$c->generation,$r?->id,$r?->generation,$proof['workspace_id'],$proof['actor_id'],$proof['bot_id'],$proof['app_id']]);
            $existing=Identity::where('user_id',$userId)->where('identity_hash',$hash)->first();
            if (!$existing) {
                abort_if(Identity::where('user_id',$userId)->count()>=50,422,'Remove an old connection before verifying more identities.');
                $existing=Identity::create(['user_id'=>$userId,'provider'=>$c->provider,'connection_id'=>$c->id,'connection_generation'=>$c->generation,
                    'reply_connection_id'=>$r?->id,'reply_connection_generation'=>$r?->generation,'identity_hash'=>$hash,...$proof]);
            }
            return $this->payload($existing->fresh());
        });
    }
    private function connection(int $userId,string $id): Connection
    {
        $c=Connection::where('user_id',$userId)->whereKey($id)->whereNull('revoked_at')->where('health','healthy')->first();
        if(!$c)ApiError::throw(409,'channel_connection_changed','Reconnect this account before verifying it.'); return $c;
    }
    private function unchanged(Connection $old): void
    {
        $c=$this->connection($old->user_id,$old->id);
        abort_unless($c->generation===$old->generation && $c->provider===$old->provider && $c->external_identity===$old->external_identity,409,'The connection changed while verifying identity.');
    }
    public function find(int $userId,string $id): Identity { return Identity::where('user_id',$userId)->whereKey($id)->firstOrFail(); }
    public function current(Identity $i): bool
    {
        if($i->provider!=='slack'||!Gate::configured($i->provider)||$i->app_id!==config('agent_channels.slack_app_id'))return false;
        foreach([[$i->connection_id,$i->connection_generation],[$i->reply_connection_id,$i->reply_connection_generation]] as [$id,$generation]) {
            if(!$id)continue;
            if(!Connection::where('user_id',$i->user_id)->whereKey($id)->where('provider',$i->provider)->where('generation',$generation)->where('health','healthy')->whereNull('revoked_at')->exists())return false;
        }
        return true;
    }
    public function payload(Identity $i): array
    {
        $ready=$this->current($i);
        return ['id'=>$i->id,'provider'=>$i->provider,'connectionId'=>$i->connection_id,'replyConnectionId'=>$i->reply_connection_id,
            'workspaceId'=>$i->workspace_id,'actorId'=>$i->actor_id,'label'=>$i->label,'revision'=>$i->revision,'ready'=>$ready,
            'reason'=>$ready?null:'connection_or_provider_changed','createdAt'=>$i->created_at->toIso8601String()];
    }
}
