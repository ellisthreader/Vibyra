<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Vibes\AgentTools;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class Tools
{
    public function drain(object $w): void
    {
        DB::transaction(function () use ($w) {
            app(\App\Services\Vibes\Wallet::class)->lock($w->user_id);
            DB::table('cloud_actions')->where('workspace_id', $w->id)->whereIn('state', ['queued', 'running'])->where('expires_at', '<=', now())->update(['state' => 'expired']);
            foreach (DB::table('cloud_actions')->where('workspace_id', $w->id)->whereNotNull('tool_id')->whereIn('state', ['expired', 'cancelled', 'unknown'])->get() as $a) {
                if (DB::table('vibes_tools')->where('id', $a->tool_id)->whereNull('result')->exists()) {
                    DB::table('cloud_actions')->where('id', $a->id)->update(['state' => 'completed', 'result' => json_encode(['error' => 'Cloud action '.$a->state.'. No automatic execution retry.'])]);
                }
            }
        }, 5);
    }
    public function enqueue(string $turn): void
    {
        DB::transaction(function () use ($turn) {
        $t = DB::table('vibes_turns')->where('id', $turn)->firstOrFail();
        app(\App\Services\Vibes\Wallet::class)->lock($t->user_id);
        $t = DB::table('vibes_turns')->where('id', $turn)->firstOrFail();
        $chat = DB::table('vibes_chats')->where('id', $t->chat_id)->firstOrFail();
        $w = app(Budgets::class)->forChat($chat);
        if (!$w || $t->settled_at || $t->cancel_requested) return;
        $request = json_decode($t->request, true);
        abort_unless(($request['vibyraCloud']['generation'] ?? null) === $w->generation, 409, 'Cloud generation changed.');
        $pending = DB::table('vibes_tools')->where('turn_id', $turn)->whereNull('result')->get();
        foreach ($pending as $tool) {
            if (DB::table('cloud_actions')->where('tool_id', $tool->id)->exists()) continue;
            app(Actions::class)->create($w, (string) Str::uuid(), $tool->operation, json_decode($tool->arguments, true), $tool->id);
        }
        }, 5);
    }
    public function complete(object $action): void
    {
        if (!$action->tool_id) return;
        $w = DB::table('cloud_workspaces')->where('id', $action->workspace_id)->firstOrFail();
        app(AgentTools::class)->respond($w->user_id, $action->tool_id, 'allow', json_decode($action->result, true), $action->id);
    }
}
