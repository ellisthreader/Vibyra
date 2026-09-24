<?php

namespace App\Console\Commands;

use App\Jobs\RunVibesTurn;
use App\Services\Vibes\Turns;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

class RecoverVibesTurns extends Command
{
    protected $signature = 'vibyra:recover-vibes';
    protected $description = 'Reconcile sponsored turns without replaying provider execution';

    public function handle(Turns $turns): int
    {
        DB::table('vibes_turns')->whereNull('settled_at')->orderBy('created_at')->limit(100)->get()->each(function ($t) use ($turns) {
            if ($t->status === 'queued') {
                if (now()->diffInSeconds($t->updated_at, true) > 300) {
                    $claimed = DB::table('vibes_turns')->where('id', $t->id)->where('status', 'queued')->where('updated_at', $t->updated_at)
                        ->whereNull('settled_at')->update(['status' => 'reconciling']);
                    if ($claimed) $turns->settle($t->id, $t->actual_micro_usd, null, 'AI could not continue. Unused Vibes were returned.');
                }
                else RunVibesTurn::dispatch($t->id);
                return;
            }
            if ($t->status === 'waiting') {
                $oldestDeadline = DB::table('vibes_tools')->where('turn_id', $t->id)->whereNull('result')
                    ->get()->map(fn ($tool) => \App\Services\Vibes\AgentTools::expires($tool)->timestamp)->min();
                $oldestDeadline ??= \Illuminate\Support\Carbon::parse($t->updated_at)->addMinutes(15)->timestamp;
                if (now()->timestamp >= $oldestDeadline) {
                    $inFlight = DB::table('vibes_tools')->where('turn_id', $t->id)->whereNull('result')
                        ->whereNotNull('agent_workspace_id')->where('operation', 'write_file')
                        ->where('action_state', 'dispatching')->exists();
                    if ($inFlight) DB::table('vibes_tools')->where('turn_id', $t->id)->whereNull('result')
                        ->whereNotNull('agent_workspace_id')->where('operation', 'write_file')
                        ->where('action_state', 'dispatching')->update(['action_state' => 'unknown',
                            'summary' => 'Computer edit outcome unconfirmed.', 'updated_at' => now()]);
                    $turns->settle($t->id, $t->actual_micro_usd, null, $inFlight
                        ? 'The computer could not confirm an approved edit. Check the file before trying again.'
                        : 'A tool request expired. Confirmed AI usage was charged; unused Vibes were returned.');
                }
                return;
            }
            // Allow the live worker to persist its response/tool batch before recovery takes ownership.
            if ($t->status === 'running' && now()->diffInSeconds($t->updated_at, true) < 90) return;
            if ($t->generation_id) {
                try {
                    $r = Http::withToken(config('services.openrouter.key'))->timeout(10)
                        ->get('https://openrouter.ai/api/v1/generation', ['id' => $t->generation_id]);
                    $cost = $r->json('data.total_cost');
                    if ($r->successful() && is_numeric($cost) && is_finite((float) $cost) && $cost >= 0) {
                        $turns->settle($t->id, $t->actual_micro_usd + (int) ceil($cost * 1000000), $t->response,
                            $t->response ? null : 'The reply was interrupted. Only confirmed usage was charged.');
                        return;
                    }
                } catch (Throwable) { /* Retain the hold until the bounded reconciliation deadline. */ }
            }
            if (now()->diffInSeconds($t->updated_at, true) > 900) {
                $turns->settle($t->id, $t->actual_micro_usd ?: null, $t->response, 'Latest usage could not be confirmed. Only earlier confirmed usage was charged.', true);
            }
        });
        return self::SUCCESS;
    }
}
