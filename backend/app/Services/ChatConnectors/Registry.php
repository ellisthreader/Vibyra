<?php

namespace App\Services\ChatConnectors;

use App\Services\ChatConnectors\Connectors\{GithubConnector, StripeConnector};

/**
 * Routes a slug to its connector and a tool call back to the integration that owns it.
 * Ownership is read from the operation's own prefix rather than a second table,
 * so a new tool cannot be offered to the model without also being routable.
 */
class Registry
{
    /**
     * Order is the order the catalogue is drawn in, so it runs from what almost
     * everyone has to what only some do, rather than alphabetically or by the day
     * each was added. No slug may be a prefix of another followed by `_`, or
     * `ownerOf` would hand one connector's tool call to the other.
     */
    private const CONNECTORS = [
        'github' => GithubConnector::class,
        'stripe' => StripeConnector::class,
    ];

    /** Slugs that have both a catalogue entry and an implementation. */
    public function slugs(): array
    {
        return array_values(array_intersect(array_keys(self::CONNECTORS), array_keys((array) config('chat_connectors.catalogue', []))));
    }

    public function has(string $slug): bool
    {
        return in_array($slug, $this->slugs(), true);
    }

    public function for(string $slug): Connector
    {
        abort_unless($this->has($slug), 404, 'That integration does not exist.');
        return app(self::CONNECTORS[$slug]);
    }

    /** The integration a tool call belongs to, or null when no integration claims it. */
    public function ownerOf(string $operation): ?string
    {
        foreach ($this->slugs() as $slug) if (str_starts_with($operation, $slug.'_')) return $slug;
        return null;
    }

    /** Every schema the given integrations offer, in the order they were asked for. */
    public function definitions(array $slugs): array
    {
        $definitions = [];
        foreach ($slugs as $slug) if ($this->has($slug)) $definitions = [...$definitions, ...$this->for($slug)->definitions()];
        return $definitions;
    }
}
