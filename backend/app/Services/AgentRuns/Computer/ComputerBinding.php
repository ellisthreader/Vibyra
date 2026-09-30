<?php

namespace App\Services\AgentRuns\Computer;

use App\Models\AgentV2\{Connection, Grant, Run, ToolAction};
use App\Services\AgentRuns\Tools\ToolRefused;
use App\Services\Agents\BranchPublication\{BranchAction, Manifest};
use App\Services\ChatConnectors\Github\WriteTools;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Turns a model's computer call into exact canonical arguments. A publish binds the
 * Mac's worktree snapshot from this task, the GitHub account granted to the teammate
 * and the branch head it expects (a later publish adds a commit on top of it). A draft
 * PR binds the last confirmed publish's branch and commits. The approval fingerprint
 * covers all of it, so a changed worktree, account or branch needs a fresh approval.
 */
final class ComputerBinding
{
    public function bind(Run $run, Connection $computer, string $tool, array $arguments): array
    {
        try {
            $args = app(ComputerTools::class)->validate($tool, $arguments);
            return match ($tool) {
                'publish_branch' => $this->publish($run, $computer, $args),
                'open_draft_pr' => $this->pullRequest($run, $computer, $args),
                default => $args,
            };
        } catch (HttpException $e) {
            throw new ToolRefused('invalid_arguments', $e->getMessage());
        }
    }

    private function publish(Run $run, Connection $computer, array $args): array
    {
        // The exact snapshot the Mac returned in this task; the Mac re-reads and refuses changed bytes at upload.
        $result = ToolAction::query()->where('run_id', $run->id)->where('connection_id', $computer->id)
            ->where('tool', 'workspace_changes')->where('state', 'completed')->get()
            ->first(fn (ToolAction $a) => ($a->result['snapshotSha256'] ?? null) === $args['snapshotSha256'])?->result;
        if (!is_array($result))
            throw new ToolRefused('invalid_arguments', 'Read workspace_changes in this task and pass its snapshotSha256.');
        Manifest::metadata($result, (string) $computer->workspace_id);
        $exact = BranchAction::arguments(BranchAction::PUBLISH, ['repository' => $args['repository'],
            'baseBranch' => $args['baseBranch'], 'message' => $args['message'], 'snapshot' => $result], (string) $computer->workspace_id);
        $last = self::lastPublish((string) $computer->workspace_id);
        $head = $last && strcasecmp($last['repository'], $exact['repository']) === 0 ? $last['headSha'] : null;
        return [...$exact, 'expectedHeadSha' => $head, 'github' => $this->github($run, $args['githubConnectionId'] ?? null)];
    }

    private function pullRequest(Run $run, Connection $computer, array $args): array
    {
        $last = self::lastPublish((string) $computer->workspace_id);
        if (!$last || !isset($last['baseBranch']))
            throw new ToolRefused('invalid_arguments', 'Publish the Agent branch before opening a pull request.');
        $exact = WriteTools::validate('github_create_pull_request', ['repository' => $last['repository'], 'head' => $last['branch'],
            'base' => $last['baseBranch'], 'expectedHeadSha' => $last['headSha'], 'expectedBaseSha' => $last['baseSha'],
            'title' => $args['title'], 'body' => $args['body'], 'draft' => true]);
        return [...$exact, 'github' => $this->github($run, $last['githubConnectionId'] ?? null)];
    }

    /** The one GitHub account this teammate may publish with, pinned by generation and grant revision. */
    private function github(Run $run, ?string $connectionId): array
    {
        $pinned = array_column($run->grant_snapshot ?? [], 'grantId');
        $grants = Grant::query()->where('agent_grants.user_id', $run->user_id)->where('agent_id', $run->agent_id)
            ->whereNull('agent_grants.revoked_at')->whereIn('agent_grants.id', $pinned)
            ->join('agent_connections', 'agent_connections.id', '=', 'agent_grants.connection_id')
            ->where('agent_connections.provider', 'github')->whereNull('agent_connections.revoked_at')
            ->when($connectionId, fn ($q) => $q->where('agent_connections.id', $connectionId))
            ->get(['agent_grants.*', 'agent_connections.generation as connection_generation'])->all();
        if (count($grants) !== 1) throw new ToolRefused('invalid_arguments', $grants === []
            ? 'Grant this teammate a GitHub account before publishing.'
            : 'Several GitHub accounts are granted; pass githubConnectionId.');
        return ['connectionId' => $grants[0]->connection_id, 'generation' => (int) $grants[0]->connection_generation,
            'grantId' => $grants[0]->id, 'grantRevision' => (int) $grants[0]->revision];
    }

    /** The pinned GitHub account is still granted, unchanged and healthy. */
    public static function githubCurrent(array $pin): ?Connection
    {
        $grant = Grant::query()->whereKey($pin['grantId'] ?? '')->whereNull('revoked_at')->first();
        $connection = Connection::query()->whereKey($pin['connectionId'] ?? '')->whereNull('revoked_at')->first();
        return $grant && $connection && $grant->revision === ($pin['grantRevision'] ?? null)
            && $grant->connection_id === $connection->id && $connection->provider === 'github'
            && $connection->generation === ($pin['generation'] ?? null) && $connection->health === 'healthy' ? $connection : null;
    }

    /** The newest confirmed branch publish for this Mac grant (V2 receipts first, then the V1 route). */
    public static function lastPublish(string $workspaceId): ?array
    {
        $connections = DB::table('agent_connections')->where('workspace_id', $workspaceId)->pluck('id');
        $v2 = ToolAction::query()->whereIn('connection_id', $connections)->where('tool', 'publish_branch')
            ->where('state', 'completed')->orderByDesc('updated_at')->get()
            ->filter(fn (ToolAction $a) => ($a->result['published'] ?? false) === true)->map(fn ($a) => $a->result);
        // The chain tip: the head no later publish built on (timestamps can tie within a second).
        $parents = $v2->pluck('previousHeadSha')->filter()->all();
        if ($v2->isNotEmpty()) return $v2->first(fn ($r) => !in_array($r['headSha'], $parents, true)) ?? $v2->first();
        $v1 = DB::table('vibes_tools')->where('agent_workspace_id', $workspaceId)->where('operation', BranchAction::PUBLISH)
            ->whereNotNull('result')->orderByDesc('updated_at')->get()
            ->first(fn ($t) => (json_decode($t->result, true)['published'] ?? false) === true);
        if (!$v1) return null;
        return [...json_decode($v1->result, true), 'baseBranch' => json_decode($v1->arguments, true)['baseBranch'] ?? null];
    }
}
