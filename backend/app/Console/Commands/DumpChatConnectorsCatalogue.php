<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * The catalogue this app actually serves, as JSON, keyed by slug in the order
 * `Registry` draws them. This exists for one caller: the mobile test that diffs
 * it against `fallbackIntegrations`, so the two copies of this menu - one here,
 * one shipped in the app for before the server has answered - cannot quietly
 * drift apart the way App/References already warns they are only kept in step
 * "by eye".
 *
 *   php artisan connectors:catalogue-json
 */
class DumpChatConnectorsCatalogue extends Command
{
    protected $signature = 'connectors:catalogue-json';

    protected $description = 'Print the chat connectors catalogue as JSON, for diffing against the mobile fallback';

    public function handle(\App\Services\ChatConnectors\Registry $registry): int
    {
        $catalogue = [];
        foreach ($registry->slugs() as $slug) {
            $entry = (array) config('chat_connectors.catalogue.'.$slug, []);
            $credential = (array) ($entry['credential'] ?? []);
            $catalogue[$slug] = [
                'id' => $slug, 'name' => $entry['name'] ?? $slug, 'tagline' => $entry['tagline'] ?? '',
                'blurb' => $entry['blurb'] ?? '', 'category' => $entry['category'] ?? '',
                'abilities' => array_values((array) ($entry['abilities'] ?? [])),
                'reads' => $entry['reads'] ?? null, 'writes' => $entry['writes'] ?? null,
                'credential' => ['label' => $credential['label'] ?? '', 'placeholder' => $credential['placeholder'] ?? '',
                    'help' => $credential['help'] ?? '', 'url' => $credential['url'] ?? ''],
            ];
        }
        $this->line((string) json_encode($catalogue, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        return self::SUCCESS;
    }
}
