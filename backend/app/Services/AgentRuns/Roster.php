<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Run;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The v2 roster summary: per teammate, its latest run state, how many exact
 * approvals wait on it, and a per-device unread marker. Replaces the v1-derived
 * status/unread dot for v2 threads.
 *
 * `readCursor` identifies the latest run's settled or waiting state. A teammate is
 * `unread` on a device when that latest run needs attention (finished, or waiting
 * for approval/sign-in) and this device has not marked that exact cursor read.
 */
final class Roster
{
    private const ATTENTION = [RunStates::WAITING_APPROVAL, RunStates::WAITING_SIGNIN, ...RunStates::TERMINAL];

    public function list(int $userId, string $device): array
    {
        $agents = DB::table('agent_teammates')->where('user_id', $userId)->orderByDesc('updated_at')->limit(50)->get();
        $ids = $agents->pluck('id');
        $latest = Run::query()->where('user_id', $userId)->whereIn('agent_id', $ids)
            ->whereIn('id', fn ($q) => $q->from('agent_runs as r')->select('r.id')->whereColumn('r.agent_id', 'agent_runs.agent_id')
                ->orderByDesc('r.conversation_seq')->limit(1))->get()->keyBy('agent_id');
        $waiting = DB::table('agent_tool_actions')->join('agent_runs', 'agent_runs.id', '=', 'agent_tool_actions.run_id')
            ->where('agent_runs.user_id', $userId)->whereIn('agent_runs.agent_id', $ids)
            ->where('agent_tool_actions.state', 'pending_approval')->where('agent_tool_actions.expires_at', '>', now())
            ->whereNotIn('agent_runs.state', RunStates::TERMINAL)
            ->groupBy('agent_runs.agent_id')->selectRaw('agent_runs.agent_id, count(*) as total')->pluck('total', 'agent_id');
        $reads = DB::table('agent_v2_read_markers')->where('user_id', $userId)->where('device', $device)->pluck('cursor', 'agent_id');
        return $agents->map(function ($agent) use ($latest, $waiting, $reads) {
            $run = $latest->get($agent->id);
            $cursor = self::cursor($run);
            return ['agentId' => $agent->id, 'name' => $agent->name, 'avatar' => $agent->avatar,
                'brief' => Str::limit((string) $agent->brief, 180), 'archived' => (bool) $agent->archived_at,
                'status' => $run?->state ?? 'idle', 'waitingApprovalCount' => (int) $waiting->get($agent->id, 0),
                'lastRun' => $run ? ['id' => $run->id, 'state' => $run->state, 'stateReason' => $run->state_reason,
                    'terminal' => RunStates::terminal($run->state), 'conversationSeq' => $run->conversation_seq,
                    'preview' => Str::limit((string) ($run->answer ?? $run->prompt), 180),
                    'createdAt' => $run->created_at?->toIso8601String(), 'finishedAt' => $run->finished_at?->toIso8601String()] : null,
                'readCursor' => $cursor, 'unread' => $cursor !== null && $reads->get($agent->id) !== $cursor,
                'fundingSource' => 'connected_account',
                'updatedAt' => ($run?->updated_at ?? \Illuminate\Support\Carbon::parse($agent->updated_at))->toIso8601String()];
        })->sortByDesc('updatedAt')->values()->all();
    }

    /** Marks the teammate read on this device. 409 `stale_cursor` when the latest run moved on; a no-op while it works. */
    public function read(int $userId, string $agentId, string $device, string $cursor): void
    {
        DB::transaction(function () use ($userId, $agentId, $device, $cursor) {
            $agent = DB::table('agent_teammates')->where('user_id', $userId)->where('id', $agentId)->lockForUpdate()->first();
            if (!$agent) ApiError::throw(404, 'agent_not_found', 'That teammate does not exist.');
            $run = Run::query()->where('user_id', $userId)->where('agent_id', $agentId)->orderByDesc('conversation_seq')->first();
            $current = self::cursor($run);
            if ($current === null) return; // Still working: nothing to mark yet.
            if (!hash_equals($current, $cursor))
                ApiError::throw(409, 'stale_cursor', 'This conversation changed. Refresh before marking it read.');
            DB::table('agent_v2_read_markers')->updateOrInsert(['user_id' => $userId, 'agent_id' => $agentId, 'device' => $device],
                ['cursor' => $cursor, 'updated_at' => now(), 'created_at' => now()]);
        });
    }

    /** Null while nothing needs attention (no runs, or the latest is still working). */
    public static function cursor(?Run $run): ?string
    {
        if (!$run || !in_array($run->state, self::ATTENTION, true)) return null;
        $pending = $run->state === RunStates::WAITING_APPROVAL
            ? DB::table('agent_tool_actions')->where('run_id', $run->id)->where('state', 'pending_approval')->orderBy('id')->pluck('id')->implode(',') : '';
        return hash('sha256', $run->id.':'.$run->state.':'.$pending);
    }
}
