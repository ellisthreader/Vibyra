<?php

namespace App\Services\Platform\Mcp;

use App\Models\ApiKey;
use App\Models\User;
use App\Services\AgentRuns\ApiError;
use App\Services\Platform\PlatformRuns;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * The tools Vibyra offers as an MCP server. Names, descriptions and schemas are constants: nothing from an account, a run or a
 * request ever shapes them. Every tool needs the API key scope shown next to it, and a tool the key lacks the scope for is neither
 * listed nor callable. There is deliberately no approval, billing or key tool: a run that needs approval waits for the person.
 */
final class ServerTools
{
    private const LIMIT = ['type' => 'integer', 'minimum' => 1, 'maximum' => 50];
    private const UUID = ['type' => 'string', 'format' => 'uuid'];

    public const TOOLS = [
        'list_runs' => ['scope' => 'runs:read', 'description' => 'List the account\'s recent Vibyra runs, newest first. Read-only.',
            'inputSchema' => ['type' => 'object', 'properties' => ['agentId' => self::UUID, 'limit' => self::LIMIT], 'additionalProperties' => false]],
        'get_run' => ['scope' => 'runs:read', 'description' => 'Get one Vibyra run by id: its state, prompt, answer and a summary of its actions. Read-only.',
            'inputSchema' => ['type' => 'object', 'properties' => ['runId' => self::UUID], 'required' => ['runId'], 'additionalProperties' => false]],
        'list_projects' => ['scope' => 'projects:read', 'description' => 'List the projects kept on the account\'s cloud computer. Read-only.',
            'inputSchema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false]],
        'start_run' => ['scope' => 'runs:create', 'description' => 'Start a new Vibyra run from a prompt. It cannot approve anything: a run that needs approval waits for the person in the Vibyra app.',
            'inputSchema' => ['type' => 'object', 'properties' => ['prompt' => ['type' => 'string', 'minLength' => 1], 'agentId' => self::UUID,
                'idempotencyKey' => ['type' => 'string', 'minLength' => 8, 'maxLength' => 100]], 'required' => ['prompt'], 'additionalProperties' => false]],
    ];

    public function __construct(private readonly PlatformRuns $runs) {}

    /** @return array tool definitions for the scopes this key holds */
    public function listFor(ApiKey $key): array
    {
        $out = [];
        foreach (self::TOOLS as $name => $tool) {
            if (!in_array($tool['scope'], $key->scopes ?? [], true)) continue;
            $schema = $tool['inputSchema'];
            if ($schema['properties'] === []) $schema['properties'] = new \stdClass; // JSON `{}`, not `[]`
            $out[] = ['name' => $name, 'description' => $tool['description'], 'inputSchema' => $schema,
                'annotations' => ['readOnlyHint' => $name !== 'start_run', 'destructiveHint' => false, 'openWorldHint' => false]];
        }
        return $out;
    }

    /** @return array an MCP tool result; a refusal is a result with isError, never a thrown error */
    public function call(User $user, ApiKey $key, string $name, array $args): array
    {
        $tool = self::TOOLS[$name] ?? null;
        if (!$tool) return $this->result('Unknown tool.', true);
        if (!in_array($tool['scope'], $key->scopes ?? [], true)) return $this->result('This API key does not have the '.$tool['scope'].' scope.', true);
        try {
            return $this->result(json_encode(match ($name) {
                'list_runs' => ['runs' => array_map(fn ($r) => $this->runs->payload($r), $this->runs->list($user->id,
                    is_string($args['agentId'] ?? null) ? $args['agentId'] : null, is_int($args['limit'] ?? null) ? $args['limit'] : 20))],
                'get_run' => ['run' => $this->runs->payload($this->runs->find($user->id, (string) ($args['runId'] ?? '')))],
                'list_projects' => ['projects' => $this->runs->projects($user->id)],
                'start_run' => $this->runs->start($user, is_string($args['agentId'] ?? null) ? $args['agentId'] : null,
                    (string) ($args['prompt'] ?? ''), is_string($args['idempotencyKey'] ?? null) ? $args['idempotencyKey'] : null),
            }, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
        } catch (HttpResponseException $e) {
            return $this->result((string) ($e->getResponse()->getData(true)['error'] ?? 'The request was refused.'), true);
        }
    }

    private function result(string $text, bool $error = false): array
    {
        return ['content' => [['type' => 'text', 'text' => $text]], 'isError' => $error];
    }
}
