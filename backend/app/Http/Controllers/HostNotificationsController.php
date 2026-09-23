<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\UserPayloads;
use App\Models\VibyraSession;
use App\Services\Progress\WorkEvents;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class HostNotificationsController extends Controller
{
    use UserPayloads;
    public function credential(Request $r)
    {
        abort_unless(config('intelligence.host_events') && config('intelligence.events'),503,'Computer notifications are not enabled.');
        $u=$this->authenticatedUser($r);$session=$this->authenticatedSession($r);
        $d=$r->validate(['hostId'=>['required','string','regex:/^[a-f0-9]{64}$/']]);
        DB::table('remote_hosts')->where('user_id',$u->id)->where('host_id',$d['hostId'])->whereNull('revoked_at')->firstOrFail();
        $token=Str::random(72);
        DB::table('host_notification_credentials')->where('expires_at','<',now())->delete();
        DB::table('host_notification_credentials')->insert(['user_id'=>$u->id,'session_id'=>$session->id,'host_id'=>$d['hostId'],
            'token_hash'=>hash('sha256',$token),'expires_at'=>now()->addMinutes(5)]);
        return response()->json(['ok'=>true,'token'=>$token])->header('Cache-Control','private, no-store');
    }
    public function ingest(Request $r)
    {
        abort_unless(config('intelligence.host_events') && config('intelligence.events'),503,'Computer notifications are not enabled.');
        $c=DB::table('host_notification_credentials')->where('token_hash',hash('sha256',(string)$r->bearerToken()))->where('expires_at','>',now())->first();
        abort_unless($c,401);
        $s=VibyraSession::find($c->session_id);
        abort_unless($s && !$s->revoked_at && $s->user_id===$c->user_id && $s->idle_expires_at?->isFuture() && $s->absolute_expires_at?->isFuture(),401);
        DB::table('remote_hosts')->where('host_id',$c->host_id)->where('user_id',$c->user_id)->whereNull('revoked_at')->firstOrFail();
        $d=$r->validate(['events'=>'required|array|max:50','events.*.sessionId'=>'required|string|max:100',
            'events.*.generation'=>'required|string|max:100','events.*.turnId'=>'required|string|max:100',
            'events.*.sequence'=>'required|integer|min:1','events.*.occurredAt'=>'required|date',
            'events.*.phase'=>'required|in:working,approval_pending,question_pending,reply_ready,failed,stopped,unavailable']);
        foreach($d['events'] as $e) DB::transaction(function() use($c,$e) {
            // Lock one registered computer to serialize replay cursors and account revocation.
            DB::table('remote_hosts')->where('host_id',$c->host_id)->where('user_id',$c->user_id)->whereNull('revoked_at')->lockForUpdate()->firstOrFail();
            $at=\Illuminate\Support\Carbon::parse($e['occurredAt']);
            if($at->lt(now()->subMinutes(15)) || $at->gt(now()->addMinute())) return;
            $key=['user_id'=>$c->user_id,'host_id'=>$c->host_id,'session'=>$e['sessionId'],'generation'=>$e['generation']];
            $old=DB::table('host_notification_cursors')->where($key)->first();
            $latest=DB::table('host_notification_cursors')->where('user_id',$c->user_id)
                ->where('host_id',$c->host_id)->where('session',$e['sessionId'])
                ->orderByDesc('observed_at')->orderByDesc('id')->first();
            // Once a known generation is superseded it cannot resurrect an old approval.
            if($old && $latest && $latest->generation !== $e['generation']) return;
            if($old && $old->sequence >= $e['sequence']) return;
            DB::table('host_notification_cursors')->updateOrInsert($key,['sequence'=>$e['sequence'],'observed_at'=>now()]);
            $run=hash('sha256',json_encode([$c->host_id,$e['sessionId'],$e['generation'],$e['turnId']]));
            app(WorkEvents::class)->record($c->user_id,'host_conversation',$run,[
                'phase'=>$e['phase'],'hostId'=>$c->host_id,'sessionId'=>$e['sessionId'],'turnId'=>$e['turnId'],
                'generation'=>$e['generation'],'sequence'=>$e['sequence'],'occurredAt'=>$at->toIso8601String()]);
        });
        return response()->json(['ok'=>true]);
    }
}
