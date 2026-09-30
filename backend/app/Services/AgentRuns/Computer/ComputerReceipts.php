<?php

namespace App\Services\AgentRuns\Computer;

use App\Models\AgentV2\{Connection, ToolAction};
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Tools\Executor;
use App\Services\Agents\BranchPublication\Manifest;
use App\Services\Agents\VmTestAction;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Validates one Mac receipt against the exact approved arguments and records it.
 * Edit receipts carry the written file hash and the worktree snapshot digest (diff
 * fingerprint); test receipts the guest snapshot and an output digest; a publish
 * receipt is the exact byte upload, which the server then writes to GitHub.
 */
final class ComputerReceipts
{
    public function __construct(private readonly Executor $executor) {}

    /** @return array|null a validated publish upload to queue, else null */
    public function record(ToolAction $action, array $result, string $key): ?array
    {
        abort_if(strlen(json_encode($result)) > ($action->tool === 'publish_branch' ? 24 * 1024 * 1024 : 16000), 422,
            'Computer receipt is too large.');
        $error = $result['error'] ?? null;
        if ($error !== null) {
            abort_unless(is_string($error) && strlen($error) <= 500 && count($result) === 1, 422, 'Invalid computer refusal.');
            // A claimed edit that reports an error may have partly happened: unknown, like the V1 route.
            if ($action->tool === 'workspace_edit') return $this->finish($action, 'unknown', ['error' => $error.' Check the file before trying again.',
                'outcome' => 'outcome_unknown'], 'Edit outcome unconfirmed', $key);
            return $this->finish($action, 'failed', ['error' => $error, 'outcome' => 'refused', 'reason' => 'computer_refused'],
                mb_substr($error, 0, 255), $key);
        }
        $args = $action->arguments ?? [];
        switch ($action->tool) {
            case 'workspace_edit':
                abort_unless(($result['written'] ?? false) === true && ($result['path'] ?? null) === $args['path']
                    && ($result['sha256'] ?? null) === hash('sha256', $args['content']), 422, 'The edit receipt does not match the approved file.');
                $diff = $result['snapshotSha256'] ?? null;
                abort_unless($diff === null || (is_string($diff) && preg_match('/\A[a-f0-9]{64}\z/D', $diff)), 422, 'Invalid worktree digest.');
                return $this->finish($action, 'completed', ['written' => true, 'path' => $args['path'], 'sha256' => $result['sha256'],
                    'snapshotSha256' => $diff], 'Edited '.$args['path'].' in the Agent worktree', $key, $result['sha256']);
            case 'run_test':
                $digest = $result['outputSha256'] ?? null;
                unset($result['outputSha256']);
                VmTestAction::receipt($args, $result);
                abort_unless($digest === hash('sha256', $result['output']), 422, 'The test output digest does not match.');
                $summary = $result['timedOut'] ? 'Mac VM test timed out' : 'Mac VM test exited '.$result['exitCode'];
                return $this->finish($action, 'completed', [...$result, 'outputSha256' => $digest], $summary, $key, $result['snapshot']);
            case 'publish_branch':
                $upload = $result['upload'] ?? null;
                abort_unless(is_array($upload) && count($result) === 1, 422, 'Send the exact publish upload.');
                try {
                    $metadata = $upload;
                    foreach ($metadata['files'] ?? [] as $i => $file) unset($metadata['files'][$i]['contentBase64']);
                    Manifest::validate($upload, (string) $this->workspace($action));
                    $same = Manifest::metadata($metadata, (string) $this->workspace($action)) === $args['snapshot'];
                } catch (HttpException) { $same = false; }
                if (!$same) return $this->finish($action, 'failed', ['error' => 'The Mac worktree changed after approval. Review the current changes.',
                    'outcome' => 'refused', 'reason' => 'snapshot_changed'], 'Worktree changed before publication', $key);
                $action->forceFill(['phase' => 'uploaded', 'summary' => 'Publishing the approved branch'])->save();
                return $upload;
            default:
                if ($action->tool === 'workspace_read') abort_unless(is_string($result['content'] ?? null)
                    && ($result['sha256'] ?? null) === hash('sha256', $result['content']), 422, 'Invalid file read receipt.');
                if ($action->tool === 'workspace_changes') {
                    try { Manifest::metadata($result, (string) $this->workspace($action)); }
                    catch (HttpException $e) { ApiError::throw(422, 'invalid_receipt', $e->getMessage()); }
                }
                return $this->finish($action, 'completed', $result, 'Read from the Mac project', $key,
                    $result['snapshotSha256'] ?? $result['sha256'] ?? null);
        }
    }

    private function workspace(ToolAction $action): ?string
    {
        return Connection::query()->whereKey($action->connection_id)->value('workspace_id');
    }

    private function finish(ToolAction $action, string $state, array $result, string $summary, string $key, ?string $resource = null): ?array
    {
        $status = match ($state) { 'completed' => 'confirmed', 'unknown' => 'unknown', default => 'failed' };
        $outcome = $state === 'completed' ? 'confirmed' : ($result['outcome'] ?? 'refused');
        $this->executor->finish($action, $state, $status, $outcome, $result, $summary,
            ['resourceId' => $resource, 'idempotencyKey' => $key]);
        return null;
    }
}
