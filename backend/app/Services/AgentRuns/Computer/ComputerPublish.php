<?php

namespace App\Services\AgentRuns\Computer;

use App\Jobs\PublishAgentV2Branch;
use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\Connections\Credentials;
use App\Services\AgentRuns\Tools\Executor;
use App\Services\Agents\BranchPublication\{Manifest, Publisher};
use Illuminate\Support\Facades\DB;

/**
 * The server half of an approved branch publish: the Mac uploaded the exact approved
 * bytes; one encrypted job reserves the write (`uploaded` → `writing`), rechecks access
 * and writes to GitHub with the pinned account. A duplicate job never writes twice and
 * an unconfirmed write is recorded as unknown, never retried.
 */
final class ComputerPublish
{
    public function __construct(private readonly Executor $executor, private readonly Credentials $credentials,
        private readonly Publisher $publisher) {}

    public function queue(string $actionId, array $upload): void
    {
        try {
            PublishAgentV2Branch::dispatch($actionId, $upload);
        } catch (\Throwable) {
            $action = ToolAction::query()->findOrFail($actionId);
            if ($action->phase === 'uploaded') $this->finish($action, ['published' => false, 'refused' => true,
                'reason' => 'The GitHub publication could not be queued. Nothing was written.']);
        }
    }

    public function run(string $actionId, array $upload): void
    {
        $reserved = DB::transaction(function () use ($actionId) {
            // Lock order is run → action, like cancel, approvals, Mac receipts and the sweeper. Action → run here could deadlock with any of
            // them on Postgres (harness: a job waiting for the run lock already held the action row).
            $runId = ToolAction::query()->whereKey($actionId)->value('run_id');
            $run = $runId ? Run::query()->whereKey($runId)->lockForUpdate()->first() : null;
            $action = $run ? ToolAction::query()->whereKey($actionId)->lockForUpdate()->first() : null;
            if (!$action || $action->state !== 'dispatching' || $action->phase !== 'uploaded') return null;
            if (ComputerDispatch::stale($action, $run, false)) return [$action, null];
            $action->forceFill(['phase' => 'writing', 'summary' => 'Writing the approved branch to GitHub'])->save();
            return [$action, ComputerBinding::githubCurrent($action->arguments['github'])];
        });
        if (!$reserved) return; // A duplicate delivery never replays a write.
        [$action, $github] = $reserved;
        if (!$github) {
            $this->finish($action, ['published' => false, 'refused' => true,
                'reason' => 'Access to this computer or GitHub account changed before publication. Nothing was written.']);
            return;
        }
        $args = $action->arguments;
        try {
            $workspace = (string) \App\Models\AgentV2\Connection::query()->whereKey($action->connection_id)->value('workspace_id');
            $manifest = Manifest::validate($upload, $workspace);
            $result = $this->publisher->publish($this->credentials->for($github), $args['repository'], $args['baseBranch'],
                $args['message'], $manifest, $args['expectedHeadSha'] ?? null);
        } catch (\Throwable) {
            $result = ['published' => false, 'error' => 'The GitHub branch outcome was not confirmed. Inspect the repository before retrying.'];
        }
        $this->finish($action, [...$result, 'baseBranch' => $args['baseBranch'], 'githubConnectionId' => $github->id]);
    }

    private function finish(ToolAction $action, array $result): void
    {
        if (!empty($result['published'])) {
            $this->executor->finish($action, 'completed', 'confirmed', 'confirmed', $result,
                'Published '.$result['branch'].' at '.substr($result['headSha'], 0, 12),
                ['resourceId' => $result['headSha'], 'url' => $result['commitUrl'] ?? null, 'idempotencyKey' => 'publish:'.$action->id]);
            return;
        }
        $unknown = isset($result['error']);
        $this->executor->finish($action, $unknown ? 'unknown' : 'failed', $unknown ? 'unknown' : 'failed',
            $unknown ? 'outcome_unknown' : 'refused', [...$result, 'error' => $result['error'] ?? $result['reason'] ?? 'Not published.'],
            $unknown ? 'Branch outcome unconfirmed' : 'Branch not published', ['idempotencyKey' => 'publish:'.$action->id]);
    }
}
