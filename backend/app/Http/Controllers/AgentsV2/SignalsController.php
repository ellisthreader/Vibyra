<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Services\AgentRuns\Grants;
use App\Services\AgentWork\Signals\{Settings,Onboarding,Watches,Findings,Digests,WatchAuthority,GoalContext};
use Illuminate\Http\Request;
final class SignalsController extends Controller
{
    use V2Requests;
    private function user(Request $r): int { return $this->v2User($r)->id; }
    public function index(Request $r)
    {
        $user=$this->user($r); $d=$r->validate(['agentId'=>'required|uuid']); app(Grants::class)->agent($user,$d['agentId']);
        return $this->json(['enabled'=>Settings::enabled(),'preferences'=>app(Settings::class)->preferences($user),'onboarding'=>app(Onboarding::class)->payload($user,$d['agentId']),
            'watches'=>app(Watches::class)->list($user,$d['agentId']),'findings'=>app(Findings::class)->list($user,$d['agentId']),
            'goals'=>app(GoalContext::class)->choices($user,$d['agentId']),'digests'=>app(Digests::class)->list($user),'connections'=>app(WatchAuthority::class)->choices($user,$d['agentId'])]);
    }
    public function preferences(Request $r)
    {
        $u=$this->user($r); $d=$r->validate(['expectedRevision'=>'required|integer|min:1','mode'=>'required|in:decisions,daily,all',
            'timezone'=>'required|timezone','quietStart'=>'present|nullable|integer|min:0|max:1439','quietEnd'=>'present|nullable|integer|min:0|max:1439',
            'digestMinute'=>'required|integer|min:0|max:1439']);
        return $this->json(['preferences'=>app(Settings::class)->save($u,$d)]);
    }
    public function onboarding(Request $r)
    {
        $u=$this->user($r); $d=$r->validate(['expectedRevision'=>'required|integer|min:0','agentId'=>'required|uuid',
            'interests'=>'present|array|max:3','interests.*'=>'required|in:code,email,meetings|distinct','dismissed'=>'required|boolean']);
        return $this->json(['onboarding'=>app(Onboarding::class)->save($u,$d)]);
    }
    public function watch(Request $r,string $id)
    {
        $u=$this->v2User($r)->id; $d=$r->validate(['expectedRevision'=>'required|integer|min:0','agentId'=>'required|uuid',
            'goalId'=>'sometimes|nullable|uuid','connectionId'=>'required|uuid','repository'=>'required|string|max:220','enabled'=>'required|boolean']);
        return $this->json(['watch'=>app(Watches::class)->save($u,$id,$d)]);
    }
    public function dismiss(Request $r,string $id)
    {
        app(Findings::class)->dismiss($this->v2User($r)->id,$id); return $this->json(['ok'=>true]);
    }
    public function digest(Request $r,string $id)
    {
        return $this->json(['digest'=>app(Digests::class)->find($this->v2User($r)->id,$id)]);
    }
}
