<?php
namespace App\Services\AgentWork\Signals;
use App\Services\AgentRuns\{Grants,Templates};
use App\Services\AgentRuns\Connections\Connections;
use Illuminate\Support\Facades\DB;
final class Onboarding
{
    private const STARTERS=[
        'code'=>['pr_shepherd','Review pull requests',['github'=>['github_list_pull_requests']]],
        'email'=>['inbox_triage','Summarize unread email',['gmail'=>['gmail_search','gmail_read']]],
        'meetings'=>['morning_brief','See upcoming meetings',['google_calendar'=>['google_calendar_list_calendars','google_calendar_list_events']]],
    ];
    public function save(int $user,array $d): array
    {
        return DB::transaction(function()use($user,$d){
            DB::table('users')->where('id',$user)->lockForUpdate()->first();
            $old=DB::table('agent_signal_onboarding')->where('user_id',$user)->first();
            Settings::revision((int)($old->revision??0),$d['expectedRevision']);
            app(Grants::class)->agent($user,$d['agentId']);
            DB::table('agent_signal_onboarding')->updateOrInsert(['user_id'=>$user],['revision'=>($old->revision??0)+1,
                'interests'=>json_encode(array_values(array_unique($d['interests']))),'dismissed'=>$d['dismissed'],'updated_at'=>now(),'created_at'=>$old->created_at??now()]);
            return $this->payload($user,$d['agentId']);
        });
    }
    public function payload(int $user,string $agent): array
    {
        $row=DB::table('agent_signal_onboarding')->where('user_id',$user)->first();
        $interests=$row?json_decode($row->interests,true):[];
        $suggestions=[];
        if (!($row->dismissed??false)) foreach ($interests as $interest) {
            if (isset(self::STARTERS[$interest])) $suggestions[]=$this->suggestion($user,$agent,$interest);
        }
        return ['revision'=>(int)($row->revision??0),'interests'=>$interests,'dismissed'=>(bool)($row->dismissed??false),'suggestions'=>$suggestions];
    }
    private function suggestion(int $user,string $agent,string $interest): array
    {
        [$key,$title,$needed]=self::STARTERS[$interest];
        $template=app(Templates::class)->payload($key); $connections=app(Connections::class)->active($user);
        $grants=collect(app(Grants::class)->active($user,$agent))->keyBy('connection_id'); $missing=[];
        foreach($needed as $provider=>$operations) {
            $connected=array_filter($connections,fn($c)=>$c->provider===$provider && $c->health==='healthy');
            if (!$connected) $missing[]='Connect '.$provider.'.';
            elseif (!array_filter($connected,fn($c)=>array_diff($operations,$grants->get($c->id)?->operations??[])===[])) $missing[]='Choose this teammate’s read access to '.$provider.'.';
        }
        $watch=null;
        if ($interest==='code') {
            foreach(DB::table('agent_signal_watches')->where('user_id',$user)->where('agent_id',$agent)->where('enabled',true)->get() as $w)
                if(app(WatchAuthority::class)->current($w)) { $watch=$w; break; }
            if(!$watch) $missing[]='Choose an exact repository to watch.';
        }
        $prompt=match($interest){
            'code'=>'Read up to five open pull requests in '.($watch?->repository??'the chosen repository').'. Give a short summary with source links. Read only; do not comment or change anything.',
            'email'=>'Read up to five unread emails. Summarize which need my attention and why. Read only; do not send, archive, mark read or change anything.',
            default=>'List my calendars, then summarize up to five upcoming meetings for the next day with their source times. Read only; do not create or change events.',
        };
        return ['key'=>$interest,'templateKey'=>$template['key'],'title'=>$title,'reason'=>'Based on your stated '.$interest.' interest and this teammate’s current read access.',
            'ready'=>$missing===[],'missing'=>$missing,'firstTask'=>$missing===[]?['prompt'=>$prompt,'readOnly'=>true]:null];
    }
}
