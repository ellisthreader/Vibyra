<?php
namespace App\Services\AgentChannels;
use App\Models\AgentV2\{Run,RuntimeBinding,ToolAction};
use App\Services\AgentRuns\{RunStates,Jobs\AccountLock};
use App\Services\AgentRuns\Tools\{Approvals,Executor,Providers\ToolFailure};
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
final class Replies
{
    public static function handles(?ToolAction $action): bool{return $action?->tool===ReplyTool::NAME;}
    public function dispatch(string $actionId,?CarbonInterface $strandedBefore=null): ?string
    {
        if(DB::transactionLevel()>0)throw new \LogicException('Channel dispatch must run outside all caller transactions.');
        $initial=ToolAction::find($actionId);if(!$initial||!self::handles($initial))return null;
        $prepared=DB::transaction(function()use($initial,$strandedBefore){
            AccountLock::force($initial->user_id);$run=Run::where('user_id',$initial->user_id)->whereKey($initial->run_id)->firstOrFail();
            $authority=true;try{RunContext::fence(RuntimeBinding::findOrFail($run->runtime_binding_id),$run->id);}
            catch(\Illuminate\Http\Exceptions\HttpResponseException|\Symfony\Component\HttpKernel\Exception\HttpException $e){$authority=false;}
            $run=Run::whereKey($run->id)->lockForUpdate()->firstOrFail();$a=ToolAction::whereKey($initial->id)->lockForUpdate()->firstOrFail();
            if($a->state!=='approved'||$a->dispatched_at!==null||($strandedBefore&&$a->updated_at->gt($strandedBefore)))return null;
            $c=RunContext::context($run);
            if(!\App\Services\Account\AccountAccess::allowed($run->user_id)||!$authority||!$c||$run->cancel_requested_at||RunStates::terminal($run->state)||($a->expires_at&&$a->expires_at->isPast())
                ||!hash_equals((string)$a->fingerprint,Approvals::fingerprint($a,$run->user_id))){
                app(Executor::class)->finish($a,'refused','failed','refused',['reason'=>'channel_authority_changed','error'=>'The reviewed channel reply is no longer authorised.'],'Channel reply refused');return ['refused'=>true];
            }
            $a->forceFill(['state'=>'dispatching','dispatched_at'=>now()])->save();return ['action'=>$a,'context'=>$c];
        });
        if(!$prepared)return null;if(isset($prepared['refused']))return 'refused';
        // Dispatch intent is committed before either provider call. An outer caller transaction would break that guarantee.
        $action=$prepared['action'];$c=$prepared['context'];$identity=app(Identities::class)->find($action->user_id,$c['identityId']);
        try{
            if(!\App\Services\Account\AccountAccess::allowed($action->user_id))throw ToolFailure::refused('account_banned','Account access was revoked.');
            if(!app(Identities::class)->current($identity))throw ToolFailure::refused('access_changed','The channel account changed before dispatch.');
            $result=app(Providers\ReplySender::class)->send($identity,$c['destination'],$action);
            $this->record($action,'completed','confirmed',$result);return 'claimed';
        }catch(ToolFailure $e){$unknown=$e->outcome===ToolFailure::UNKNOWN;$this->record($action,$unknown?'unknown':'failed',$e->outcome,
                ['reason'=>$e->reason,'error'=>$e->getMessage(),'outcome'=>$e->outcome]);}
        catch(\App\Services\ChatConnectors\ReconnectRequired $e){$this->record($action,'failed','reconnect_required',['reason'=>'reconnect_required','error'=>'Reconnect the channel account.']);}
        catch(\Throwable $e){report($e);$this->record($action,'unknown','outcome_unknown',['reason'=>'outcome_unknown','error'=>'Check the original conversation; this reply will not be sent again.']);}
        return 'claimed';
    }
    /** Factual receipt path: retain an actual response even when cancellation/revocation won after dispatch. */
    private function record(ToolAction $old,string $state,string $outcome,array $result): void
    {
        DB::transaction(function()use($old,$state,$outcome,$result){
            AccountLock::force($old->user_id);Run::whereKey($old->run_id)->lockForUpdate()->firstOrFail();$a=ToolAction::whereKey($old->id)->lockForUpdate()->firstOrFail();
            if(!in_array($a->state,['dispatching','unknown'],true))return;
            app(Executor::class)->finish($a,$state,$state==='completed'?'confirmed':($state==='unknown'?'unknown':'failed'),$outcome,$result,
                $state==='completed'?'Channel reply confirmed':($state==='unknown'?'Channel reply outcome unknown':'Channel reply not sent'),
                ['resourceId'=>$result['id']??null,'idempotencyKey'=>'channel:'.$a->id]);
        });
    }
    public function settle(string $actionId): ?string
    {
        $a=ToolAction::find($actionId);if(!$a||!self::handles($a)||$a->state!=='dispatching')return null;
        if(($a->dispatched_at??$a->updated_at)->gt(now()->subMinutes(max(1,(int)config('agents_v2.dispatch_stale_minutes',5)))))return null;
        $this->record($a,'unknown','outcome_unknown',['reason'=>'outcome_unknown','error'=>'The process stopped before a reply receipt. No retry was sent.']);return 'unknown';
    }
}
