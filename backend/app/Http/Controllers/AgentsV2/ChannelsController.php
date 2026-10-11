<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Models\AgentChannels\{Binding,Identity};
use App\Services\AgentChannels\{Gate,Bindings,Identities,Audiences,Threads};
use Illuminate\Http\Request;
final class ChannelsController extends Controller
{
    use V2Requests;
    public function index(Request $r)
    {
        $id=$this->v2User($r)->id;return $this->json(['enabled'=>(bool)config('agents_v2.channels_enabled'),'providers'=>Gate::providers(),
            'identities'=>Identity::where('user_id',$id)->where('provider','slack')->latest()->limit(50)->get()->map(fn($i)=>app(Identities::class)->payload($i))->all(),
            'bindings'=>Binding::where('user_id',$id)->whereIn('identity_id',Identity::where('provider','slack')->select('id'))->latest()->limit(50)->get()->map(fn($b)=>app(Bindings::class)->payload($b))->all()]);
    }
    public function connect(Request $r,\App\Services\ChatConnectors\ConnectorOAuth $oauth)
    {
        $user=$this->v2User($r);Gate::require($user->id);Gate::provider('slack');
        $d=$r->validate(['role'=>'required|in:owner,bot','returnUrl'=>'nullable|string|max:500']);
        return $this->json($oauth->start($user->id,'slack',$d['returnUrl']??null,'channel_'.$d['role']));
    }
    public function identity(Request $r,Identities $identities)
    {
        $d=$r->validate(['connectionId'=>'required|uuid','replyConnectionId'=>'nullable|uuid']);
        return $this->json(['identity'=>$identities->verify($this->v2User($r)->id,$d['connectionId'],$d['replyConnectionId']??null)]);
    }
    public function audiences(Request $r,Audiences $audiences){return $this->json(['audiences'=>$audiences->list($this->v2User($r)->id)]);}
    public function show(Request $r,string $id,Bindings $bindings){return $this->json(['binding'=>$bindings->payload($bindings->find($this->v2User($r)->id,$id))]);}
    public function save(Request $r,string $id,Bindings $bindings){return $this->json(['binding'=>$bindings->save($this->v2User($r)->id,$id,$r->all())]);}
    public function delete(Request $r,string $id,Bindings $bindings)
    {
        $d=$r->validate(['expectedRevision'=>'required|integer|min:1']);return $this->json(['binding'=>$bindings->revoke($this->v2User($r)->id,$id,$d['expectedRevision'])]);
    }
    public function threads(Request $r,string $id,Threads $threads){return $this->json(['threads'=>$threads->list($this->v2User($r)->id,$id)]);}
    public function thread(Request $r,string $id,Threads $threads){return $this->json(['thread'=>$threads->find($this->v2User($r)->id,$id)]);}
}
