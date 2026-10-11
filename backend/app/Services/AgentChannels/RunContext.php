<?php
namespace App\Services\AgentChannels;
use App\Models\AgentV2\{Run,RuntimeBinding};
use App\Services\AgentRuns\{ApiError,RuntimeBindings};
use App\Services\AgentWork\RuntimePins;
use Illuminate\Support\Facades\{Crypt,DB};
final class RunContext
{
    public static function map(?string $runId): ?object {if(!$runId)return null;return DB::table('agent_channel_runs')->where('run_id',$runId)->first();}
    public static function isolated(Run $run): bool {if(!$run->id)return false;return \App\Services\AgentRuns\Jobs\Contexts::mode($run)==='channel'||self::map($run->id)!==null;}
    public static function context(Run $run): ?array
    {
        $m=self::map($run->id);if(!$m)return null;abort_unless((int)$m->user_id===(int)$run->user_id,403);
        return json_decode(Crypt::decryptString($m->context),true,32,JSON_THROW_ON_ERROR);
    }
    public static function metadata(Run $run): array
    {
        $c=self::context($run);return $c?array_intersect_key($c,array_flip(['bindingId','bindingRevision','threadId','eventId','provider','audience','senderLabel'])):[];
    }
    /** Account lock is acquired by the caller before channel/runtime/run locks. */
    public static function fence(RuntimeBinding $runtime,string $runId,bool $receiptOnly=false): void
    {
        $m=self::map($runId);if(!$m){$run=Run::find($runId);if($run&&self::isolated($run))ApiError::throw(409,'channel_context_missing','The reviewed channel context is unavailable.');return;}abort_unless((int)$m->user_id===(int)$runtime->user_id,403);
        $c=json_decode(Crypt::decryptString($m->context),true,32,JSON_THROW_ON_ERROR);
        abort_unless(RuntimePins::same($c['runtime'],RuntimeBindings::snapshot($runtime)),409,'The channel task belongs to another selected account.');
        if($receiptOnly)return;
        $b=app(Bindings::class)->find($runtime->user_id,$m->binding_id,true);self::authority($b,(int)$m->binding_revision);
    }
    public static function authority(\App\Models\AgentChannels\Binding $b,int $revision): void
    {
        Gate::require($b->user_id);
        if($b->revision!==$revision||!app(Bindings::class)->current($b))ApiError::throw(409,'channel_authority_changed','This channel binding changed or expired. Review a new binding.');
        $i=app(Identities::class)->find($b->user_id,$b->identity_id);
        $ids=array_values(array_filter([$i->connection_id,$i->reply_connection_id]));sort($ids);
        \App\Models\AgentV2\Connection::whereIn('id',$ids)->orderBy('id')->lockForUpdate()->get();
        if(!app(Identities::class)->current($i))ApiError::throw(409,'channel_connection_changed','The verified channel account was revoked or replaced.');
        $runtime=RuntimeBinding::findOrFail($b->runtime_binding_id);app(\App\Services\AgentRuns\Cloud\Authority::class)->check($runtime);
        if (!\App\Services\AgentRuns\Jobs\Capacity::supports($runtime) || ($runtime->capabilities['controlledTools']??false)!==true) ApiError::throw(409,'runtime_upgrade','Update the selected runtime before using channel agents.');
        RuntimePins::require($b->user_id,$b->runtime_snapshot);app(\App\Services\AgentRuns\Grants::class)->agent($b->user_id,$b->agent_id);
    }
    public static function filterTools(Run $run,array $entries): array
    {
        return self::isolated($run)?[ReplyTool::entry($run)]:$entries;
    }
    public static function authorizeTool(Run $run,array $call): void
    {
        if(self::isolated($run)&&($call['tool']??null)!==ReplyTool::NAME)ApiError::throw(403,'channel_tool_scope','Channel tasks can only propose a reply to their reviewed audience.');
    }
    public static function profile(Run $run): ?array
    {
        $c=self::context($run);if(!$c&&self::isolated($run))ApiError::throw(409,'channel_context_missing','The reviewed channel context is unavailable.');return $c?['name'=>'Channel agent','brief'=>$c['publicInstructions'],'memory'=>'','skills'=>[]]:null;
    }
}
