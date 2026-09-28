<?php

namespace App\Services\Agents;

use App\Services\Agents\BranchPublication\BranchAction;
use App\Services\Vibes\Turns;
use Illuminate\Support\Facades\DB;

/** Revocation also settles pending work and preserves uncertain write outcomes. */
final class WorkspaceRevocation
{
    public function revoke(int $user, string $id): void
    {
        $removed = DB::transaction(function () use ($user, $id) {
            $grant = DB::table('agent_workspaces')->where('id', $id)->where('user_id', $user)->lockForUpdate()->firstOrFail();
            if ($grant->revoked_at) return false;
            DB::table('agent_workspaces')->where('id', $id)->update(['revoked_at' => now(), 'updated_at' => now()]);
            DB::table('agent_teammates')->where('id', $grant->agent_id)->increment('revision');
            return true;
        });
        if (!$removed) return;
        $turns = DB::table('vibes_tools')->join('vibes_turns', 'vibes_turns.id', '=', 'vibes_tools.turn_id')
            ->where('vibes_tools.agent_workspace_id', $id)->whereNull('vibes_tools.result')
            ->whereNull('vibes_turns.settled_at')->where('vibes_turns.user_id', $user)
            ->pluck('vibes_turns.id')->unique();
        foreach ($turns as $turnId) {
            $turn = DB::table('vibes_turns')->where('id', $turnId)->first();
            $inFlightWrite = DB::table('vibes_tools')->where('turn_id', $turnId)->where('agent_workspace_id', $id)
                ->where('operation', 'write_file')->where('action_state', 'dispatching')->exists();
            $inFlightPublish = DB::table('vibes_tools')->where('turn_id', $turnId)->where('agent_workspace_id', $id)
                ->where('operation', BranchAction::PUBLISH)->whereIn('action_state', ['dispatching', 'publishing', 'writing'])->exists();
            $inFlightTest = DB::table('vibes_tools')->where('turn_id', $turnId)->where('agent_workspace_id', $id)
                ->where('operation', 'run_test')->where('action_state', 'dispatching')->exists();
            $inFlight = $inFlightWrite || $inFlightTest || $inFlightPublish;
            if ($inFlight) DB::table('vibes_tools')->where('turn_id', $turnId)->where('agent_workspace_id', $id)
                ->whereIn('operation', ['write_file', 'run_test', BranchAction::PUBLISH])
                ->whereIn('action_state', ['dispatching', 'publishing', 'writing'])->update([
                    'action_state' => 'unknown', 'summary' => 'Computer action outcome unconfirmed.', 'updated_at' => now()]);
            if ($turn) app(Turns::class)->settle($turnId, $turn->actual_micro_usd, null,
                $inFlightPublish ? 'Agent Computer access was removed during GitHub branch publication. Inspect the repository for its outcome.'
                : ($inFlightWrite ? 'Agent Computer access was removed while an approved edit was in progress. Check the file on your computer.'
                    : ($inFlightTest ? 'Agent Computer access was removed while a shell test was running. Its result is unconfirmed.'
                        : 'Agent Computer access was removed. Confirmed AI usage was charged; unused Vibes were returned.')));
        }
    }
}
