<?php

namespace App\Services\Agents\BranchPublication;

use Illuminate\Support\Facades\DB;

/** Model-facing preview and exact branch-publication proposal. */
final class BranchAction
{
    public const PREVIEW = 'git_publish_preview';
    public const PUBLISH = 'publish_branch';

    public static function definitions(): array
    {
        $string = ['type' => 'string'];
        return [
            ['type' => 'function', 'function' => ['name' => self::PREVIEW,
                'description' => 'Read the complete safe Mac edit-worktree snapshot needed before proposing an exact GitHub branch publication. No GitHub write occurs.',
                'parameters' => ['type' => 'object', 'properties' => (object) [],
                    'required' => [], 'additionalProperties' => false]]],
            ['type' => 'function', 'function' => ['name' => self::PUBLISH,
                'description' => 'Propose one new GitHub Agent branch using the snapshotSha256 returned by git_publish_preview in this task. Requires exact user approval; the server attaches every file from the Mac receipt.',
                'parameters' => ['type' => 'object', 'properties' => [
                    'repository' => $string, 'baseBranch' => $string,
                    'message' => $string, 'snapshotSha256' => $string,
                ], 'required' => ['repository', 'baseBranch', 'message', 'snapshotSha256'],
                    'additionalProperties' => false]]],
        ];
    }

    /** Resolve the model's digest against a Mac receipt in this exact task. */
    public static function proposal(array $args, string $workspaceId, string $turnId): array
    {
        $keys = array_keys($args); sort($keys);
        abort_unless($keys === ['baseBranch', 'message', 'repository', 'snapshotSha256']
            && is_string($args['snapshotSha256'])
            && preg_match('/\A[a-f0-9]{64}\z/D', $args['snapshotSha256']),
            422, 'Preview the Mac worktree before proposing its branch.');
        $preview = DB::table('vibes_tools')->where('turn_id', $turnId)
            ->where('agent_workspace_id', $workspaceId)->where('operation', self::PREVIEW)
            ->where('decision', 'allow')->whereNotNull('result')
            ->orderByDesc('updated_at')->orderByDesc('id')->first();
        $result = $preview ? json_decode($preview->result, true) : null;
        abort_unless(is_array($result) && !isset($result['error']), 409,
            'The Mac has not returned a complete publish preview for this task.');
        $snapshot = Manifest::metadata($result, $workspaceId);
        abort_unless(hash_equals($snapshot['snapshotSha256'], $args['snapshotSha256']),
            409, 'That publish preview changed. Read the current Mac snapshot.');
        return self::arguments(self::PUBLISH, [
            'repository' => $args['repository'], 'baseBranch' => $args['baseBranch'],
            'message' => $args['message'], 'snapshot' => $result,
        ], $workspaceId);
    }

    public static function previewReceipt(array $result, string $workspaceId): void
    {
        if (isset($result['error'])) {
            abort_unless(array_keys($result) === ['error'] && is_string($result['error'])
                && strlen($result['error']) <= 500, 422, 'Invalid Mac publish preview refusal.');
            return;
        }
        Manifest::metadata($result, $workspaceId);
    }

    public static function arguments(string $name, array $args, string $workspaceId): array
    {
        if ($name === self::PREVIEW) {
            abort_unless($args === [], 422, 'The publish preview takes no arguments.');
            return [];
        }
        abort_unless($name === self::PUBLISH, 422, 'Unsupported branch action.');
        $keys = array_keys($args); sort($keys);
        abort_unless($keys === ['baseBranch', 'message', 'repository', 'snapshot'],
            422, 'Choose one repository, base branch, message and complete snapshot.');
        $repo = $args['repository']; $branch = $args['baseBranch']; $message = $args['message'];
        abort_unless(is_string($repo) && preg_match('#\A[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\z#D', $repo)
            && !in_array('.', explode('/', $repo), true) && !in_array('..', explode('/', $repo), true)
            && is_string($branch) && strlen($branch) <= 100
            && preg_match('#\A[A-Za-z0-9][A-Za-z0-9._/-]*\z#D', $branch)
            && !str_contains($branch, '..') && !str_contains($branch, '//')
            && !str_ends_with($branch, '/') && !str_ends_with($branch, '.')
            && is_string($message) && $message !== '' && trim($message) === $message
            && strlen($message) <= 200 && !str_contains($message, "\0"),
            422, 'Choose a safe GitHub repository, base branch and commit message.');
        abort_unless(is_array($args['snapshot']), 422, 'The complete publish snapshot is required.');
        $snapshotInput = $args['snapshot'];
        $suppliedTotal = $snapshotInput['totalBytes'] ?? null;
        unset($snapshotInput['totalBytes']);
        $snapshot = Manifest::metadata($snapshotInput, $workspaceId);
        abort_unless($suppliedTotal === null || $suppliedTotal === $snapshot['totalBytes'],
            422, 'The snapshot total no longer matches its files.');
        return ['repository' => $repo, 'baseBranch' => $branch, 'message' => $message,
            'snapshot' => $snapshot];
    }
}
