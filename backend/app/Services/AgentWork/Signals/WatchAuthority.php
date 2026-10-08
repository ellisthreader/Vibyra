<?php
namespace App\Services\AgentWork\Signals;
use App\Models\AgentV2\{Connection,Grant};
use App\Services\AgentRuns\{Access,Grants};
use Illuminate\Support\Facades\DB;
final class WatchAuthority
{
    public function selected(int $user,string $agent,string $connection): array
    {
        app(Grants::class)->agent($user,$agent);
        $c=Connection::query()->whereKey($connection)->where('user_id',$user)->where('provider','github')->whereNull('revoked_at')->first();
        abort_unless($c && $c->health==='healthy',409,'Choose a healthy GitHub connection.');
        $g=Grant::query()->where('user_id',$user)->where('agent_id',$agent)->where('connection_id',$connection)->whereNull('revoked_at')->first();
        abort_unless($g && in_array('github_list_pull_requests',$g->operations??[],true),409,'Grant this teammate GitHub pull-request read access first.');
        return [$c,$g];
    }
    public function current(object $watch): ?Connection
    {
        if (!Settings::enabled() || !$watch->enabled || !app(Access::class)->allows($watch->user_id)
            || !$this->pro($watch->user_id)) return null;
        try { [$c,$g]=$this->selected($watch->user_id,$watch->agent_id,$watch->connection_id); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException|\Illuminate\Http\Exceptions\HttpResponseException) { return null; }
        return $c->generation===$watch->connection_generation && $g->id===$watch->grant_id && $g->revision===$watch->grant_revision ? $c : null;
    }
    public function requireCreation(int $user): void
    {
        abort_unless(Settings::enabled(),503,'Agent work is not enabled.'); app(Access::class)->require($user);
        abort_unless($this->pro($user),403,'Pro is required to watch a repository.');
    }
    private function pro(int $user): bool
    {
        $u=\App\Models\User::find($user);
        return $u && app(\App\Services\Membership\PlanLimits::class)->allows($u,'agents');
    }
    public function choices(int $user,string $agent): array
    {
        $grants=collect(app(Grants::class)->active($user,$agent))->keyBy('connection_id');
        return Connection::query()->where('user_id',$user)->where('provider','github')->where('health','healthy')->whereNull('revoked_at')->get()
            ->map(fn($c)=>['id'=>$c->id,'provider'=>'github','account'=>$c->external_identity,
                'readGranted'=>in_array('github_list_pull_requests',$grants->get($c->id)?->operations??[],true)])->all();
    }
}
