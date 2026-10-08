<?php

namespace App\Services\AgentRuns\CloudFiles;

use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\{ApiError, Canonical, Events};
use App\Services\AgentRuns\Guard\SecretGuard;

/** Invoked only under Broker's run lease fence and transaction. No external effects. */
final class FileBroker
{
    public function request(Run $run, array $call): ToolAction
    {
        FileScope::attributes($run);
        if ($call['connectionId'] !== $run->id) ApiError::throw(403, 'wrong_cloud_file_scope', 'Private files belong to this task scope.');
        if ($call['schemaRevision'] !== FileTools::revision($call['tool']))
            ApiError::throw(409, 'schema_changed', 'Refresh the private-file tool manifest.');
        if ($run->tool_calls >= (int) config('agents_v2.max_tool_calls'))
            ApiError::throw(409, 'limit_reached', 'This task reached its tool-call limit.');
        $write = $call['tool'] === 'cloud_write_file';
        $result = $write ? app(Files::class)->write($run, $call['arguments']) : app(Files::class)->read($run, $call['arguments']);
        // The encrypted immutable file version is the only stored content copy.
        unset($result['file']['content']);
        $arguments = $call['arguments'];
        unset($arguments['content']);
        $summary = $write ? 'Saved private file revision '.$result['file']['revision'] : 'Read private workspace';
        $action = ToolAction::query()->create(['run_id' => $run->id, 'user_id' => $run->user_id,
            'instruction_revision' => $run->instruction_revision, 'call_id' => $call['callId'], 'tool' => $call['tool'], 'kind' => 'read',
            'connection_id' => $run->id, 'connection_generation' => 0, 'grant_id' => $run->id, 'grant_revision' => 0,
            'arguments' => $arguments, 'args_hash' => Canonical::hash($call['arguments']),
            'schema_revision' => $call['schemaRevision'], 'state' => 'completed', 'result' => $result, 'summary' => $summary]);
        $run->forceFill(['tool_calls' => $run->tool_calls + 1])->save();
        app(Events::class)->append($run, 'tool.result', ['actionId' => $action->id, 'callId' => $action->call_id,
            'tool' => $action->tool, 'connectionId' => $run->id, 'provider' => 'cloud_files', 'summary' => $summary]);
        return $action;
    }

    /** Rehydrate exactly the recorded immutable version for the model, never for action-history storage. */
    public static function result(ToolAction $action): array
    {
        $result = $action->result ?? [];
        if ($action->tool !== 'cloud_read_file' || !isset($result['file']['path'], $result['file']['revision'])) return $result;
        $run = Run::findOrFail($action->run_id);
        $result = app(Files::class)->read($run, ['path' => $result['file']['path'], 'revision' => $result['file']['revision']]);
        $file = &$result['file'];
        $safe = SecretGuard::enabled() ? SecretGuard::redact($file['content']) : $file['content'];
        if ($safe !== $file['content']) {
            $file['redacted'] = true;
            $file['storedSha256'] = $file['sha256'];
            $file['content'] = $safe;
            $file['bytes'] = strlen($safe);
            $file['sha256'] = hash('sha256', $safe);
        }
        return $result;
    }
}
