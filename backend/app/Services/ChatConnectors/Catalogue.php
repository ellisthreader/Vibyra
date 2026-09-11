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
                // `oauth` once this server can send a person to the provider's own sign-in;
                // until then the same entry is connected with a pasted key.
                'kind' => $this->oauth->configured($slug) ? 'oauth' : 'token',
                'label' => (string) ($credential['label'] ?? ''),
                'placeholder' => (string) ($credential['placeholder'] ?? ''),
                'help' => (string) ($credential['help'] ?? ''),
                'url' => (string) ($credential['url'] ?? ''),
            ],
            'installed' => (bool) $install,
            'account' => $install->account_label ?? null,
            'connectedAt' => $install->connected_at ?? null,
        ];
    }
}
