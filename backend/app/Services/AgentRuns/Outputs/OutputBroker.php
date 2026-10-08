<?php

namespace App\Services\AgentRuns\Outputs;

use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\{ApiError, Canonical, Events};
use App\Services\AgentRuns\Tools\Providers\Schema;

/** Runs only inside Broker's fenced transaction; saving and its call-ID receipt commit together. */
final class OutputBroker
{
    public function request(Run $run, array $call): ToolAction
    {
        Outputs::enabled();
        if ($call['connectionId'] !== $run->id) ApiError::throw(403, 'wrong_output_scope', 'Output tools belong to this task.');
        if ($call['schemaRevision'] !== OutputTools::revision($call['tool']))
            ApiError::throw(409, 'schema_changed', 'Refresh the output tool manifest.');
        if ($run->tool_calls >= (int) config('agents_v2.max_tool_calls'))
            ApiError::throw(409, 'limit_reached', 'This task reached its tool-call limit.');
        $service = app(Outputs::class);
        if ($call['tool'] === 'save_output') {
            $output = $service->save($run, $call['arguments']);
            $result = ['output' => $service->payload($output)];
            $summary = 'Saved '.$output->title.' (revision '.$output->revision.')';
        } else {
            Schema::only($call['arguments'], ['id']);
            $id = $call['arguments']['id'] ?? null;
            if ($id !== null) {
                abort_unless(is_string($id), 422, 'Use an output ID.');
                $output = $service->find($run->user_id, $id);
                if ($output->agent_id !== $run->agent_id) ApiError::throw(404, 'output_not_found', 'That output does not belong to this teammate.');
                $result = ['output' => $service->payload($output)];
            } else $result = ['outputs' => array_map(fn ($o) => array_intersect_key($o,
                array_flip(['id', 'title', 'kind', 'revision', 'runId'])), $service->list($run->user_id, $run->agent_id))];
            $summary = $id ? 'Opened saved output' : 'Listed saved outputs';
        }
        $action = ToolAction::query()->create(['run_id' => $run->id, 'user_id' => $run->user_id,
            'instruction_revision' => $run->instruction_revision, 'call_id' => $call['callId'], 'tool' => $call['tool'], 'kind' => 'read',
            'connection_id' => $run->id, 'connection_generation' => 0, 'grant_id' => $run->id, 'grant_revision' => 0,
            'arguments' => $call['arguments'], 'args_hash' => Canonical::hash($call['arguments']),
            'schema_revision' => $call['schemaRevision'], 'state' => 'completed', 'result' => $result, 'summary' => $summary]);
        $run->forceFill(['tool_calls' => $run->tool_calls + 1])->save();
        app(Events::class)->append($run, 'tool.result', ['actionId' => $action->id, 'callId' => $action->call_id,
            'tool' => $action->tool, 'connectionId' => $run->id, 'provider' => 'outputs', 'summary' => $summary]);
        return $action;
    }
}
