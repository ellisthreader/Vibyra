<?php
namespace App\Services\AgentRuns\Jobs;

use App\Models\AgentV2\{Connection, ToolAction};
use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\LocalMcp\LocalMcpTools;
use App\Services\AgentRuns\Computer\ComputerTools;

/** Keys derive from validated arguments and trusted account identity, never a free model path. */
final class ResourceKeys
{
    public static function key(ToolAction $action): string
    {
        $args = $action->arguments ?? [];
        $connection = Connection::query()->find($action->connection_id);
        $provider = $connection?->provider ?? '';
        if (str_starts_with($action->tool, 'github_') || in_array($action->tool, ['publish_branch', 'open_draft_pr'], true)) {
            // Different grants/accounts can still write the same repository.
            $scope = ['github' => strtolower((string) ($args['repository'] ?? ''))];
        } elseif (str_contains($action->tool, 'calendar_')) {
            $scope = ['calendar' => $args['calendarId'] ?? 'primary',
                'identity' => $connection?->external_identity ?: $action->connection_id];
        } elseif ($provider === ComputerTools::PROVIDER || LocalMcpTools::isProvider($provider)) {
            // A local server can touch the same files as a computer tool; serialize both conservatively.
            $scope = ['local-write' => true];
        } else {
            $scope = ['provider' => $provider, 'identity' => $connection?->external_identity ?: $action->connection_id];
        }
        return Canonical::hash($scope);
    }
}
