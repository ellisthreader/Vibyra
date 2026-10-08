<?php

namespace App\Services\AgentRuns\Outputs;

use App\Models\AgentV2\Run;
use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\Tools\Providers\Schema;

/** Local output tools never carry an integration grant or provider credential. */
final class OutputTools
{
    public static function has(string $tool): bool { return in_array($tool, ['save_output', 'read_output'], true); }

    public static function definition(string $tool): array
    {
        if ($tool === 'read_output') return Schema::tool($tool,
            'Reopen a saved output by id, or omit id to list this teammate\'s saved outputs. Read before revising; quote its current revision.',
            ['id' => ['type' => 'string', 'format' => 'uuid']]);
        return Schema::tool('save_output', 'Save a persistent checklist, table or text output for this teammate. For a follow-up change, read_output '
            .'then save the SAME id and current revision, not a new copy. Plain data only: checklist content={items:[{id,text,checked}]}; '
            .'table content={columns:[string],rows:[[string]]}; text content={text:string}. No scripts, HTML rendering, attachments, files or external actions. '
            .'sourceActionIds may cite completed actions from this task only. Saving is not sending/publishing. Limits: 100 items/rows, 12 columns, 64 KB.',
            ['id' => ['type' => 'string', 'format' => 'uuid'], 'revision' => ['type' => 'integer', 'minimum' => 1],
                'kind' => ['type' => 'string', 'enum' => ['checklist', 'table', 'text']], 'title' => ['type' => 'string', 'maxLength' => 160],
                'content' => ['type' => 'object', 'properties' => [
                    'text' => ['type' => 'string'], 'items' => ['type' => 'array', 'items' => ['type' => 'object',
                        'properties' => ['id' => ['type' => 'string'], 'text' => ['type' => 'string'], 'checked' => ['type' => 'boolean']],
                        'required' => ['id', 'text', 'checked'], 'additionalProperties' => false]],
                    'columns' => ['type' => 'array', 'items' => ['type' => 'string']],
                    'rows' => ['type' => 'array', 'items' => ['type' => 'array', 'items' => ['type' => 'string']]]], 'additionalProperties' => false],
                'sourceActionIds' => ['type' => 'array', 'maxItems' => 20, 'items' => ['type' => 'string', 'format' => 'uuid']]],
            ['title', 'content']);
    }

    public static function revision(string $tool): string { return substr(Canonical::hash(self::definition($tool)), 0, 12); }

    public static function entries(Run $run): array
    {
        if (!config('agents_v2.outputs_enabled')) return [];
        return array_map(function ($tool) use ($run) {
            $d = self::definition($tool);
            return ['tool' => $tool, 'connectionId' => $run->id, 'provider' => 'outputs', 'account' => null,
                'kind' => 'read', 'requiresApproval' => false, 'schemaRevision' => self::revision($tool),
                'description' => $d['description'], 'parameters' => $d['parameters']];
        }, ['save_output', 'read_output']);
    }
}
