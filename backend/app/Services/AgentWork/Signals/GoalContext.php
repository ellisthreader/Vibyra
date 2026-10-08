<?php
namespace App\Services\AgentWork\Signals;
use App\Models\AgentWork\Goal;
/** Owner-selected repository relevance only. Provider metadata never changes goal progress. */
final class GoalContext
{
    public function selected(int $user,string $agent,?string $id): ?string
    {
        if ($id===null)return null;
        abort_unless(Goal::whereKey($id)->where('user_id',$user)->where('agent_id',$agent)->exists(),404,'Choose a goal belonging to this teammate.');
        return $id;
    }
    public function choices(int $user,string $agent): array
    {
        return Goal::where('user_id',$user)->where('agent_id',$agent)->orderByDesc('created_at')->limit(100)->get()
            ->map(fn($g)=>['id'=>$g->id,'title'=>$g->title,'status'=>$g->status])->all();
    }
    public function payload(int $user,string $agent,?string $id): ?array
    {
        if ($id===null)return null;
        $g=Goal::whereKey($id)->where('user_id',$user)->where('agent_id',$agent)->first(); if(!$g)return null;
        $milestone=null;
        foreach($g->milestones as $step) if($step['status']!=='delivered') {
            $milestone=array_intersect_key($step,array_flip(['key','title','successCriteria','status'])); break;
        }
        $reason=match($g->status) {
            'active'=>'You linked this repository to this goal. Review this change against the current milestone criteria.',
            'blocked'=>'You linked this repository to this blocked goal. Review whether this change affects its blocker.',
            'awaiting_review'=>'You linked this repository to this goal awaiting your review. Consider this change before confirming the goal is finished.',
            'paused'=>'You linked this repository to this paused goal. Review this change before deciding whether to resume.',
            default=>'You linked this repository to this goal. Its current status is '.$g->status.'; this change does not reopen or complete it.',
        };
        return ['id'=>$g->id,'title'=>$g->title,'status'=>$g->status,'milestone'=>$milestone,'reason'=>$reason,'reviewRequired'=>true];
    }
}
