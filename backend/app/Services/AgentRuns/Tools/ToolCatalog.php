<?php

namespace App\Services\AgentRuns\Tools;

use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\Tools\Providers\Adapters;

/**
 * The exact tools Agent V2 brokers: the Stage 2 core three, the Stage 3 wave 1
 * providers, and per-account remote MCP servers and reviewed Composio toolkits.
 * Each provider's V2 adapter owns its schemas, validation and typed outcomes; the
 * ordinary-chat connectors are reused underneath but left unchanged.
 */
final class ToolCatalog
{
    public function __construct(private readonly Adapters $adapters) {}

    public function providers(): array
    {
        return $this->adapters->providers();
    }

    /** @return string[] */
    public function operations(string $provider): array
    {
        return $this->adapters->has($provider) ? array_keys($this->adapters->for($provider)->tools()) : [];
    }

    public function providerOf(string $tool): ?string
    {
        return $this->adapters->providerOfTool($tool);
    }

    public function kind(string $tool): ?string
    {
        $provider = $this->providerOf($tool);
        return $provider ? $this->adapters->for($provider)->tools()[$tool] : null;
    }

    /** The OpenAI-style function body: name, description, parameters. */
    public function definition(string $tool): array
    {
        if ($tool === \App\Services\AgentWork\Proposals\ProposalTool::NAME)
            return \App\Services\AgentWork\Proposals\ProposalTool::definition();
        if (\App\Services\AgentRuns\CloudFiles\FileTools::has($tool))
            return \App\Services\AgentRuns\CloudFiles\FileTools::definition($tool);
        if (\App\Services\AgentRuns\Outputs\OutputTools::has($tool))
            return \App\Services\AgentRuns\Outputs\OutputTools::definition($tool);
        $provider = $this->providerOf($tool);
        return $provider ? $this->adapters->for($provider)->definition($tool) : [];
    }

    /** Changes whenever the schema the model sees changes; stale calls are refused. */
    public function schemaRevision(string $tool): string
    {
        return substr(Canonical::hash($this->definition($tool)), 0, 12);
    }

    public function validate(string $tool, array $arguments): array
    {
        return $this->adapters->for((string) $this->providerOf($tool))->validate($tool, $arguments);
    }
}
