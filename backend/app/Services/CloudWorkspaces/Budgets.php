<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\DB;

final class Budgets
{
    public function committed(object $w): int
    {
        $runtime = (int) DB::table('cloud_reservations')->where('workspace_id', $w->id)
            ->selectRaw('COALESCE(SUM(CASE WHEN settled_at IS NULL THEN reserved ELSE charged END), 0) AS units')->value('units');
        $ai = $w->chat_id ? (int) DB::table('vibes_turns')->where('chat_id', $w->chat_id)
            ->selectRaw('COALESCE(SUM(CASE WHEN settled_at IS NULL THEN reserved ELSE charged END), 0) AS units')->value('units') : 0;
        return $runtime + $ai;
    }
    public function guard(object $w, int $next): void
    {
        abort_if($this->committed($w) + $next > $w->budget_units, 402, 'This computer has reached its combined runtime and AI token limit.');
        $this->accountGuard($w->user_id, $next);
    }
    public function accountGuard(int $user, int $next): void
    {
        foreach ([['day', now()->subDay(), 'account_daily_units'], ['month', now()->subDays(30), 'account_monthly_units']] as [$name, $since, $key]) {
            $sum = 0;
            foreach (['cloud_reservations', 'vibes_turns'] as $table) {
                $sum += (int) DB::table($table)->where('user_id', $user)->where('created_at', '>=', $since)
                    ->selectRaw('COALESCE(SUM(CASE WHEN settled_at IS NULL THEN reserved ELSE charged END), 0) AS units')->value('units');
            }
            abort_if($sum + $next > config('cloud_workspaces.'.$key), 402, 'Your combined '.$name.' spending limit is reached.');
        }
    }
    public function forChat(object $chat): ?object
    {
        return ($chat->cloud_workspace_id ?? null) ? DB::table('cloud_workspaces')->where('id', $chat->cloud_workspace_id)->firstOrFail() : null;
    }
    public function guardAi(object $chat, int $next): void
    {
        $w = $this->forChat($chat);
        if (!$w) {
            if (Holds::available() && DB::table('cloud_workspaces')->where('user_id', $chat->user_id)->where('state', '!=', 'deleted')->exists()) $this->accountGuard($chat->user_id, $next);
            return;
        }
        app(Eligibility::class)->authorize($w->user_id);
        abort_unless(config('cloud_workspaces.ai_enabled') && $w->state === 'ready' && $w->lease_until && now()->lt($w->lease_until), 409, 'Start this cloud computer before sending.');
        $this->guard($w, $next);
    }
}
