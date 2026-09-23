<?php
namespace App\Services\Agents;
use Illuminate\Support\Facades\DB;
final class RosterProjection
{
    public function cursor(?object $turn): ?string
    {
        return $turn ? hash('sha256', json_encode([$turn->id, $turn->updated_at, $turn->status, $turn->response, $turn->error])) : null;
    }
    public function list(int $user): array
    {
        $agents = DB::table('agent_teammates')->where('user_id', $user)->orderByDesc('updated_at')->limit(50)->get();
        // Correlated latest-turn IDs keep history bounded instead of loading every turn.
        $latest = DB::table('vibes_chats')->whereIn('id', $agents->pluck('chat_id'))
            ->selectSub(fn ($q) => $q->from('vibes_turns')->select('id')->whereColumn('chat_id', 'vibes_chats.id')
                ->orderByDesc('created_at')->orderByDesc('id')->limit(1), 'latest')->pluck('latest')->filter();
        $turns = DB::table('vibes_turns')->whereIn('id', $latest)->get()->keyBy('chat_id');
        $waiting = DB::table('vibes_tools')->whereIn('turn_id', $latest)->where('action_state', 'pending')->where('created_at', '>', now()->subMinutes(15))
            ->selectRaw('turn_id, count(*) as total')->groupBy('turn_id')->pluck('total', 'turn_id');
        $local = DB::table('vibes_tools')->whereIn('turn_id', $latest)->whereNotNull('agent_workspace_id')
            ->whereNull('result')->pluck('agent_workspace_id', 'turn_id');
        $lastSeen = DB::table('agent_workspaces')->whereIn('id', $local->values()->unique())
            ->whereNull('revoked_at')->pluck('last_seen_at', 'id');
        $reads = DB::table('agent_read_markers')->where('user_id', $user)->pluck('cursor', 'agent_id');
        return $agents->map(function ($agent) use ($turns, $waiting, $local, $lastSeen, $reads, $user) {
            $turn = $turns->get($agent->chat_id); $count = $turn && $turn->status === 'waiting' && !$turn->cancel_requested && !$turn->settled_at ? (int) $waiting->get($turn->id, 0) : 0;
            $cursor = $this->cursor($turn);
            $payload = app(Teammates::class)->payload($agent, $turn, $count > 0, true);
            $workspace = $turn && $turn->status === 'waiting' && !$turn->cancel_requested && !$turn->settled_at
                ? $local->get($turn->id) : null;
            if ($workspace && !$count) {
                $seen = $lastSeen->get($workspace);
                $online = $seen && \Illuminate\Support\Carbon::parse($seen)->greaterThan(now()->subSeconds(20));
                $payload['status'] = $online ? 'waiting_for_tool' : 'computer_offline';
                $payload['lastMessage'] = $online ? 'Reading the granted project…' : 'Waiting for the Agent Computer to come online.';
            }
            return [...$payload,
                'progress' => $turn ? app(\App\Services\Progress\WorkEvents::class)->payload($user, $turn->id) : null,
                'pendingDecisionCount' => $count, 'execution' => $turn->model ?? null,
                'readCursor' => $cursor, 'unread' => $cursor !== null && $reads->get($agent->id) !== $cursor];
        })->sortByDesc('updatedAt')->values()->all();
    }
    public function read(int $user, string $id, string $cursor): void
    {
        DB::transaction(function () use ($user, $id, $cursor): void {
            $agent = DB::table('agent_teammates')->where('user_id', $user)->where('id', $id)->lockForUpdate()->firstOrFail();
            $last = DB::table('vibes_turns')->where('chat_id', $agent->chat_id)->orderByDesc('created_at')->orderByDesc('id')->first();
            abort_unless($this->cursor($last) === $cursor, 409, 'The conversation changed. Refresh before marking it read.');
            DB::table('agent_read_markers')->updateOrInsert(['user_id' => $user, 'agent_id' => $id], ['cursor' => $cursor, 'updated_at' => now(), 'created_at' => now()]);
        });
    }
}
