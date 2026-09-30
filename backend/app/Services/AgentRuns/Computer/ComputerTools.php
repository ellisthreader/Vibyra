<?php

namespace App\Services\AgentRuns\Computer;

use App\Services\AgentRuns\Tools\Providers\{ProviderTools, Schema, ToolFailure};
use App\Services\Agents\VmTestAction;

/**
 * Mac computer tools on the V2 broker (provider `computer`, one connection per granted
 * Mac folder). They run on the leased Mac, not the server: reads are claimed at once,
 * writes after exact approval. `open_draft_pr` is the one server-side step (GitHub).
 * Each tool is offered only while its existing Agent Computer flag is on.
 */
final class ComputerTools implements ProviderTools
{
    public const PROVIDER = 'computer';
    public const SERVER = ['open_draft_pr'];

    public static function onMac(string $tool): bool
    {
        return !in_array($tool, self::SERVER, true);
    }

    /** @return array<string, 'read'|'write'> */
    public function tools(): array
    {
        if (!config('agents.enabled') || !config('agents.local_runner_enabled')) return [];
        $tools = ['workspace_list' => 'read', 'workspace_read' => 'read', 'workspace_search' => 'read',
            'workspace_changes' => 'read', 'workspace_edit' => 'write'];
        if (config('agents.vm_tests_enabled')) $tools['run_test'] = 'write';
        if (config('agents.git_publish_enabled')) $tools['publish_branch'] = 'write';
        if (config('agents.git_publish_enabled') && config('agents.github_pr_enabled')) $tools['open_draft_pr'] = 'write';
        return $tools;
    }

    public function definition(string $tool): array
    {
        $s = ['type' => 'string'];
        return match ($tool) {
            'workspace_list' => Schema::tool($tool, 'List files in one folder of the granted Mac project ("" is the root). Private and dependency folders are hidden.', ['path' => $s], ['path']),
            'workspace_read' => Schema::tool($tool, 'Read one UTF-8 file (at most 8 KB) from the granted Mac project. Returns content and sha256.', ['path' => $s], ['path']),
            'workspace_search' => Schema::tool($tool, 'Search the granted Mac project for text, case-insensitively. Returns paths, line numbers and short excerpts.', ['query' => $s], ['query']),
            'workspace_changes' => Schema::tool($tool, 'Read the complete change set of the Agent worktree: base commit, branch, changed files with hashes, and snapshotSha256 (needed by publish_branch).', []),
            'workspace_edit' => Schema::tool($tool, 'Write one file (at most 8 KB) in the separate Agent worktree on the Mac. Use sha256 from workspace_read, or "new" for a new file. Requires exact approval; the original folder is untouched until the person applies the worktree.',
                ['path' => $s, 'content' => $s, 'expectedSha256' => $s], ['path', 'content', 'expectedSha256']),
            'run_test' => [...VmTestAction::definition()['function'], 'name' => 'run_test'],
            'publish_branch' => Schema::tool($tool, 'Push the reviewed Agent worktree to its GitHub branch (vibyra-agent/<grant>) using the snapshotSha256 from workspace_changes in this task. A later publish adds a new commit to the same branch. Requires exact approval.',
                ['repository' => $s, 'baseBranch' => $s, 'message' => $s, 'snapshotSha256' => $s, 'githubConnectionId' => $s],
                ['repository', 'baseBranch', 'message', 'snapshotSha256']),
            'open_draft_pr' => Schema::tool($tool, 'Open a draft pull request from the last published Agent branch into its base branch. Requires exact approval.',
                ['title' => $s, 'body' => $s], ['title']),
            default => [],
        };
    }

    public function validate(string $tool, array $a): array
    {
        abort_unless(isset($this->tools()[$tool]), 422, 'That computer tool is not enabled.');
        return match ($tool) {
            'workspace_list', 'workspace_read' => $this->only($a, ['path'], fn () => ['path' => self::path($a['path'] ?? null, $tool === 'workspace_list')]),
            'workspace_search' => $this->only($a, ['query'], fn () => ['query' => Schema::line($a['query'] ?? null, 200, 'Say what to search for, in 200 characters or fewer.')]),
            'workspace_changes' => $this->only($a, [], fn () => []),
            'workspace_edit' => $this->only($a, ['content', 'expectedSha256', 'path'], fn () => self::edit($a)),
            'run_test' => VmTestAction::arguments($a),
            'publish_branch' => $this->only($a, ['baseBranch', 'githubConnectionId', 'message', 'repository', 'snapshotSha256'], fn () => self::publish($a)),
            'open_draft_pr' => $this->only($a, ['body', 'title'], fn () => ['title' => Schema::line($a['title'] ?? null, 250, 'Give the pull request a title of 250 characters or fewer.'),
                'body' => (string) Schema::text($a['body'] ?? null, 8000, 'That pull request body is too long.', false)]),
        };
    }

    /** Computer tools never execute on the server through the generic executor. */
    public function run(string $tool, array $arguments, string $credential, string $key): array
    {
        throw ToolFailure::refused('invalid_request', 'This tool runs on the Mac.');
    }

    public function reconcile(string $tool, array $arguments, string $credential, string $key): ?array
    {
        return null;
    }

    private function only(array $args, array $allowed, \Closure $build): array
    {
        Schema::only($args, $allowed);
        return $build();
    }

    private static function edit(array $a): array
    {
        $content = $a['content'] ?? null;
        $expected = $a['expectedSha256'] ?? null;
        abort_unless(is_string($content) && strlen($content) <= 8192 && !str_contains($content, "\0"), 422,
            'A computer edit is at most 8 KB of text.');
        abort_unless($expected === 'new' || (is_string($expected) && preg_match('/\A[a-f0-9]{64}\z/D', $expected)), 422,
            'Use the sha256 from workspace_read, or "new" for a new file.');
        return ['path' => self::path($a['path'] ?? null, false), 'content' => $content, 'expectedSha256' => $expected];
    }

    private static function publish(array $a): array
    {
        abort_unless(is_string($a['snapshotSha256'] ?? null) && preg_match('/\A[a-f0-9]{64}\z/D', $a['snapshotSha256']), 422,
            'Read workspace_changes and pass its snapshotSha256.');
        $github = $a['githubConnectionId'] ?? null;
        abort_unless($github === null || (is_string($github) && preg_match('/\A[0-9a-f-]{36}\z/D', $github)), 422,
            'githubConnectionId must be a GitHub connection ID.');
        foreach (['repository', 'baseBranch', 'message'] as $field)
            abort_unless(is_string($a[$field] ?? null), 422, 'Choose the repository, base branch and commit message.');
        return array_filter(['repository' => $a['repository'], 'baseBranch' => $a['baseBranch'], 'message' => $a['message'],
            'snapshotSha256' => $a['snapshotSha256'], 'githubConnectionId' => $github], fn ($v) => $v !== null);
    }

    /** Same shape the Mac enforces again: relative, no dot/dependency parts, no traversal. */
    private static function path(mixed $path, bool $allowRoot): string
    {
        abort_unless(is_string($path) && strlen($path) <= 2048, 422, 'Choose a project-relative path.');
        if ($path === '' && $allowRoot) return '';
        foreach (explode('/', $path) as $part)
            abort_unless($part !== '' && !str_starts_with($part, '.') && !in_array($part, ['node_modules', 'vendor'], true)
                && !preg_match('/[\\\\:\0]/', $part), 422, 'That path is outside the granted project or is private.');
        return $path;
    }
}
