<?php
namespace App\Services\AgentCapabilities;
use App\Models\AgentV2\{Connection, McpServer};
use App\Services\AgentRuns\{ApiError, Canonical};
use App\Services\AgentRuns\Connections\Readiness;
use App\Services\AgentRuns\Tools\ToolCatalog;
/** Curated metadata over existing adapters; installing never executes package code. */
final class Catalogue
{
    public function __construct(private readonly Readiness $readiness, private readonly ToolCatalog $tools) {}
    public function all(): array
    {
        $rows = [];
        foreach ($this->readiness->catalogue() as $item) {
            if ($item['provider'] === 'mcp') continue;
            $rows[] = $this->make($item['provider'], $item['name'], $item['kind'], $item['provider'],
                'Vibyra', 'https://vibyra.app', $item['name'].' tools reviewed by Vibyra.', $item['connect'], $item);
        }
        foreach ((array) config('agents_v2_mcp_presets.presets', []) as $preset) {
            $rows[] = $this->make('mcp-'.$preset['id'], $preset['name'], 'mcp', 'mcp', $preset['name'],
                $preset['url'], $preset['tagline'], ['mcp_url'], $this->readiness->state('mcp'), $preset['url']);
        }
        return $rows;
    }
    public function get(string $id, ?Connection $connection = null): array
    {
        $row = collect($this->all())->firstWhere('id', $id);
        if (!$row) ApiError::throw(404, 'capability_not_found', 'That capability is not in the curated catalogue.');
        if (!$connection) return $row;
        if ($row['kind'] !== 'mcp') {
            if ($connection->provider !== $row['provider']) ApiError::throw(409, 'capability_account_mismatch', 'Choose an account for this capability.');
            return $row;
        }
        $server = McpServer::query()->where('connection_id', $connection->id)->where('user_id', $connection->user_id)->first();
        if (!$server || $server->kind !== 'remote' || $server->url !== $row['presetUrl'])
            ApiError::throw(409, 'capability_account_mismatch', 'Choose the exact curated server for this capability.');
        if ($server->pending_revision || $server->status !== 'active') {
            $row['readiness'] = 'unavailable'; $row['reason'] = 'server_review_required';
            $row['message'] = 'Connect the server and review its current tools first.';
        }
        return $this->seal([...$row, 'provider' => $connection->provider, 'operations' => $this->operations($connection->provider)]);
    }
    private function operations(string $provider): array
    {
        $operations = [];
        foreach ($this->tools->operations($provider) as $tool) {
            $definition = $this->tools->definition($tool);
            $operations[] = ['tool' => $tool, 'kind' => $this->tools->kind($tool),
                'description' => $definition['description'] ?? '', 'schemaRevision' => $this->tools->schemaRevision($tool)];
        }
        usort($operations, fn ($a, $b) => strcmp($a['tool'], $b['tool']));
        return $operations;
    }
    private function make(string $id, string $name, string $kind, string $provider, string $publisher, string $url,
        string $description, array $connect, array $state, ?string $presetUrl = null): array
    {
        return $this->seal(['id' => $id, 'name' => $name, 'kind' => $kind, 'provider' => $provider,
            'publisher' => ['name' => $publisher, 'url' => $url], 'description' => $description,
            'operations' => $this->operations($provider), 'readiness' => $state['readiness'],
            'reason' => $state['reason'], 'message' => $state['message'], 'connect' => $connect, 'presetUrl' => $presetUrl]);
    }
    private function seal(array $row): array
    {
        $review = array_intersect_key($row, array_flip(['id', 'name', 'kind', 'provider', 'publisher', 'description', 'operations', 'presetUrl']));
        $hash = Canonical::hash($review);
        return [...$row, 'version' => '1.'.substr($hash, 0, 12), 'reviewHash' => $hash];
    }
}
