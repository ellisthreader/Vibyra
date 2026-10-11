<?php
namespace App\Services\AgentBrowser;
use App\Models\AgentV2\{RuntimeBinding, ToolAction};
use App\Services\AgentRuns\{Canonical, Leases};
use App\Services\AgentRuns\Browser\BrowserActions;
use App\Services\AgentRuns\Jobs\AccountLock;
use Illuminate\Support\Facades\DB;
/** The browser helper receives bytes only after exact approval, claim and current authority checks. */
final class Uploads
{
    public function file(RuntimeBinding $binding, string $runId, string $actionId, int $generation, string $fingerprint): array
    {
        $check = function () use ($binding, $runId, $actionId, $generation, $fingerprint) {
            AccountLock::force($binding->user_id);
            $run = app(Leases::class)->fenced($binding, $runId, $generation);
            $action = ToolAction::query()->where('user_id', $binding->user_id)->where('run_id', $run->id)->whereKey($actionId)->lockForUpdate()->first();
            abort_unless($run->lease_expires_at?->isFuture() && $action && $action->tool === 'browser_upload' && $action->kind === 'write'
                && $action->state === 'dispatching' && $action->dispatched_at && (int) $action->claimed_generation === $generation
                && hash_equals((string) $action->fingerprint, $fingerprint) && !BrowserActions::stale($action, $run)
                && UploadBinding::capable($run), 409, 'This upload is no longer approved for this browser helper.');
            return [$run, $action->arguments['file'] ?? []];
        };
        [$run, $approved] = DB::transaction($check);
        try { $bytes = app(UploadSources::class)->contents($run, $approved); }
        catch (\App\Services\AgentRuns\Tools\ToolRefused $error) {
            \App\Services\AgentRuns\ApiError::throw(409, $error->reason, $error->getMessage());
        }
        // A storage read must not retain authority if cancellation/revoke won while it waited.
        [, $current] = DB::transaction($check);
        abort_unless(Canonical::hash($current) === Canonical::hash($approved), 409, 'The upload approval changed.');
        return ['file' => $approved, 'contentBase64' => base64_encode($bytes)];
    }
}
