<?php

namespace App\Services\AgentRuns\Mcp;

use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\Tools\Providers\JsonArgs;

/**
 * A server's tool list, normalised and revisioned. Each remote tool is exposed as
 * `mcp_<8 hex>__<safe name>` with a bounded description and object schema; tools
 * with unusable schemas or colliding names are left out (and counted). The
 * revision hashes exactly what a person reviewed: names, descriptions, schemas and
 * read-only hints. Any change means the server needs review again.
 */
final class ToolList
{
    private const MAX_PAGES = 5;

    public function __construct(private readonly Protocol $protocol) {}

    /** @return array{tools: array<int, array>, revision: string, skipped: int} */
    public function fetch(array $session, string $slug): array
    {
        $raw = [];
        $cursor = null;
        for ($page = 0; $page < self::MAX_PAGES; $page++) {
            $result = $this->protocol->request($session, 'tools/list', $cursor ? ['cursor' => $cursor] : []);
            foreach ((array) ($result['tools'] ?? []) as $tool) if (is_array($tool)) $raw[] = $tool;
            $cursor = is_string($result['nextCursor'] ?? null) && $result['nextCursor'] !== '' ? $result['nextCursor'] : null;
            if (!$cursor || count($raw) >= (int) config('agents_v2_mcp.max_tools', 100)) break;
        }
        return self::normalise($raw, $slug);
    }

    public static function normalise(array $raw, string $slug): array
    {
        $tools = [];
        $skipped = 0;
        foreach (array_slice($raw, 0, (int) config('agents_v2_mcp.max_tools', 100)) as $tool) {
            $remote = $tool['name'] ?? null;
            $schema = JsonArgs::schema($tool['inputSchema'] ?? null);
            $name = is_string($remote) ? $slug.'__'.substr(trim(preg_replace('/[^a-z0-9_]+/', '_', strtolower($remote)), '_'), 0, 48) : null;
            if (!is_string($remote) || strlen($remote) > 128 || $schema === null || $name === $slug.'__' || isset($tools[$name])) {
                $skipped++;
                continue;
            }
            $tools[$name] = ['tool' => $name, 'remote' => $remote,
                'description' => mb_substr(trim((string) ($tool['description'] ?? $tool['title'] ?? '')), 0, 1000),
                'inputSchema' => $schema, 'readOnlyHint' => ($tool['annotations']['readOnlyHint'] ?? false) === true,
                'destructiveHint' => ($tool['annotations']['destructiveHint'] ?? null) === true];
        }
        ksort($tools);
        $tools = array_values($tools);
        return ['tools' => $tools, 'revision' => self::revision($tools), 'skipped' => $skipped];
    }

    public static function revision(array $tools): string
    {
        return Canonical::hash(array_map(fn ($t) => [$t['remote'], $t['description'], $t['inputSchema'], $t['readOnlyHint']], $tools));
    }

    /** Stable per-tool hash, to tell which grants still point at the same reviewed tool. */
    public static function toolHash(array $tool): string
    {
        return Canonical::hash([$tool['remote'], $tool['description'], $tool['inputSchema'], $tool['readOnlyHint']]);
    }
}
