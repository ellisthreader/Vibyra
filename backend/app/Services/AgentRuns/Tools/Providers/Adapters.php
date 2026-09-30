<?php

namespace App\Services\AgentRuns\Tools\Providers;

use App\Models\AgentV2\McpServer;
use App\Services\AgentRuns\Composio\{ComposioCatalog, ComposioTools};
use App\Services\AgentRuns\Mcp\McpTools;

/**
 * The providers Agent V2 brokers, keyed by connection provider slug (the same slug
 * as `vibes_integration_installs.integration`). A built-in provider is listed only
 * once its reads and approved writes pass through the broker with typed outcomes.
 *
 * Two kinds are dynamic: a remote MCP server is its own provider `mcp_<8 hex>`
 * (tools `mcp_<8 hex>__<name>`, pinned per server), and a reviewed Composio toolkit
 * is `composio_<toolkit>` (tools `composio_<toolkit>__<name>`). The tool prefix is
 * how a tool name routes back to its provider without a global lookup.
 */
final class Adapters
{
    private const PROVIDERS = [
        'gmail' => GmailTools::class,
        'github' => GithubTools::class,
        'google_calendar' => CalendarTools::class,
        'slack' => SlackTools::class,
        'notion' => NotionTools::class,
        'linear' => LinearTools::class,
        'google_drive' => DriveTools::class,
        'google_tasks' => TasksTools::class,
        'figma' => FigmaTools::class,
        // Microsoft 365 wave (Stage 3 wave 2), all over Graph via GraphApi.
        'outlook_mail' => OutlookMailTools::class,
        'outlook_calendar' => OutlookCalendarTools::class,
        'onedrive' => OneDriveTools::class,
        'teams' => TeamsTools::class,
        'sharepoint' => SharePointTools::class,
        // Mac folder grants (Phase 4); executed by the leased Mac, see AgentRuns\Computer.
        'computer' => \App\Services\AgentRuns\Computer\ComputerTools::class,
        // Teammate browser grants (Phase 7); executed by the leased Mac, see AgentRuns\Browser.
        'browser' => \App\Services\AgentRuns\Browser\BrowserTools::class,
    ];

    /** @var array<string, ProviderTools|null> per-instance memo; one request's view of dynamic providers */
    private array $loaded = [];

    /** @return string[] built-in providers (dynamic MCP/Composio providers are per account) */
    public function providers(): array
    {
        return array_keys(self::PROVIDERS);
    }

    public function has(string $provider): bool
    {
        return isset(self::PROVIDERS[$provider]) || $this->dynamic($provider) !== null;
    }

    public function for(string $provider): ProviderTools
    {
        if (isset(self::PROVIDERS[$provider])) return $this->loaded[$provider] ??= app(self::PROVIDERS[$provider]);
        $adapter = $this->dynamic($provider);
        abort_unless($adapter !== null, 404, 'That integration is not available to teammates.');
        return $adapter;
    }

    public function providerOfTool(string $tool): ?string
    {
        if (preg_match('/^((?:mcp_[0-9a-f]{8})|(?:composio_[a-z0-9]{2,40}))__/D', $tool, $m))
            return $this->has($m[1]) && isset($this->for($m[1])->tools()[$tool]) ? $m[1] : null;
        foreach (array_keys(self::PROVIDERS) as $provider)
            if (isset($this->for($provider)->tools()[$tool])) return $provider;
        return null;
    }

    /** The name a person recognises, for outcome messages. */
    public function name(string $provider): string
    {
        $adapter = $this->has($provider) ? $this->for($provider) : null;
        if ($adapter instanceof McpTools) return $adapter->server->name;
        return (string) config('chat_connectors.catalogue.'.$provider.'.name',
            config('agents_v2_composio.toolkits.'.substr($provider, 9).'.name', ucfirst($provider)));
    }

    private function dynamic(string $provider): ?ProviderTools
    {
        if (array_key_exists($provider, $this->loaded)) return $this->loaded[$provider];
        $adapter = null;
        if (preg_match('/^mcp_[0-9a-f]{8}$/D', $provider)) {
            $server = McpServer::query()->where('slug', $provider)->first();
            $adapter = $server ? new McpTools($server) : null;
        } elseif (preg_match('/^composio_([a-z0-9]{2,40})$/D', $provider, $m) && app(ComposioCatalog::class)->has($m[1])) {
            $adapter = new ComposioTools($m[1]);
        }
        return $this->loaded[$provider] = $adapter;
    }
}
