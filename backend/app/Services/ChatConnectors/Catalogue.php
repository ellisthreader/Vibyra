<?php

namespace App\Services\ChatConnectors;

/**
 * The catalogue is a menu, not an entitlement: it answers before sign-in and
 * while the feature flag is off, the same way the model catalogue does. What the
 * flag gates is connecting an account and running a tool, never reading the list.
 */
class Catalogue
{
    public function __construct(private readonly Registry $registry, private readonly Installs $installs,
        private readonly ConnectorOAuth $oauth) {}

    public function payload(?int $userId): array
    {
        $rows = $userId ? $this->installs->all($userId) : [];
        return ['enabled' => (bool) config('chat_connectors.enabled'), 'integrations' =>
            array_map(fn ($slug) => $this->entry($slug, $rows[$slug] ?? null), $this->registry->slugs())];
    }

    private function entry(string $slug, ?object $install): array
    {
        $entry = (array) config('chat_connectors.catalogue.'.$slug, []);
        $credential = (array) ($entry['credential'] ?? []);
        $public = ($credential['kind'] ?? '') === 'public';
        $ready = (bool) (config('chat_connectors.enabled') && match ($slug) {
            'deepwiki' => config('chat_connectors.public_mcp_enabled'),
            'hackernews' => config('chat_connectors.composio_public_enabled')
                && config('chat_connectors.composio_api_key'),
            default => false,
        });
        return [
            'id' => $slug,
            // What someone types in a message to point the reply at this integration.
            'mention' => '@'.$slug,
            'name' => (string) ($entry['name'] ?? $slug),
            'tagline' => (string) ($entry['tagline'] ?? ''),
            'blurb' => (string) ($entry['blurb'] ?? ''),
            'category' => (string) ($entry['category'] ?? ''),
            'abilities' => array_values((array) ($entry['abilities'] ?? [])),
            'reads' => $entry['reads'] ?? null,
            'writes' => $entry['writes'] ?? null,
            'credential' => [
                'kind' => $public ? 'public' : 'oauth',
                'configured' => $public ? $ready : $this->oauth->configured($slug),
                'label' => (string) ($credential['label'] ?? ''),
                'placeholder' => (string) ($credential['placeholder'] ?? ''),
                'help' => (string) ($credential['help'] ?? ''),
                'url' => (string) ($credential['url'] ?? ''),
            ],
            'installed' => $public ? $ready : (bool) $install,
            'account' => $public && $ready ? ($slug === 'deepwiki'
                ? 'Public GitHub repositories' : 'Public Hacker News data') : ($install->account_label ?? null),
            'connectedAt' => $install->connected_at ?? null,
        ];
    }
}
