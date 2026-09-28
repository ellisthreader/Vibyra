<?php

namespace App\Services\Vibes;

/** Project tool schemas used by both phone projects and Agent Computer. */
final class ProjectToolDefinitions
{
    public static function basic(): array
    {
        $string = ['type' => 'string'];
        return array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], [
            ['name' => 'list_files', 'description' => 'List files in the authorized project, excluding secrets and dependencies.',
                'parameters' => ['type' => 'object', 'properties' => ['path' => $string], 'required' => ['path'], 'additionalProperties' => false]],
            ['name' => 'read_file', 'description' => 'Read a UTF-8 project file. Returns content and sha256. Do not edit truncated files.',
                'parameters' => ['type' => 'object', 'properties' => ['path' => $string], 'required' => ['path'], 'additionalProperties' => false]],
            ['name' => 'write_file', 'description' => 'Write a project file, at most 8 KB. Requires explicit user approval. Use sha256 from read_file, or new for a new file. Refused on a project opened read-only.',
                'parameters' => ['type' => 'object', 'properties' => ['path' => $string, 'content' => $string, 'expectedSha256' => $string],
                    'required' => ['path', 'content', 'expectedSha256'], 'additionalProperties' => false]],
            ['name' => 'search_files', 'description' => 'Search the authorized project for text, case-insensitively. Returns matching path, line number and a short excerpt per hit; bounded and possibly truncated.',
                'parameters' => ['type' => 'object', 'properties' => ['query' => $string], 'required' => ['query'], 'additionalProperties' => false]],
        ]);
    }

    public static function git(): array
    {
        $tools = [
            ['name' => 'git_status', 'description' => 'List changed files in the authorized project Git repository. Excludes private paths and caps the list.',
                'parameters' => ['type' => 'object', 'properties' => (object) [], 'required' => [], 'additionalProperties' => false]],
            ['name' => 'git_diff', 'description' => 'Read a bounded text diff for one changed file in the authorized project Git repository.',
                'parameters' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string']], 'required' => ['path'], 'additionalProperties' => false]],
        ];
        return array_map(fn ($tool) => ['type' => 'function', 'function' => $tool], $tools);
    }
}
