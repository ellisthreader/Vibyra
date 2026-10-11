<?php
namespace App\Services\AgentBrowser;

use App\Models\AgentV2\{BrowserHandoff, Run};
use App\Services\AgentRuns\{Lifecycle, RunStates};
use App\Services\AgentRuns\Jobs\AccountLock;
use Illuminate\Support\Facades\DB;

final class PrivateExpiry
{
    /** Lost control never resumes automation; discard the private data and end the task. */
    public static function end(BrowserHandoff $handoff): void
    {
        DB::transaction(function () use ($handoff) {
            AccountLock::force($handoff->user_id);
            $h = BrowserHandoff::whereKey($handoff->id)->lockForUpdate()->first();
            if (!$h) return;
            $r = Run::whereKey($h->run_id)->where('user_id', $h->user_id)->lockForUpdate()->first();
            if ($r && !RunStates::terminal($r->state) && $r->lease_generation === $h->generation && $h->state !== 'resumed') {
                $r->forceFill(['cancel_requested_at' => now()])->save();
                app(Lifecycle::class)->move($r, RunStates::FAILED, 'Private browser control ended. Start a new task to continue.');
            }
            $h->delete();
        });
    }

    public static function prune(): int
    {
        $rows = BrowserHandoff::where('expires_at', '<=', now())->orWhereIn('state', ['closed', 'resumed'])->limit(100)->get();
        foreach ($rows as $h) self::end($h);
        return $rows->count();
    }
}
