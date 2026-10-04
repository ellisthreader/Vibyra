<?php

namespace App\Services\ChatConnectors;

/**
 * What an ordinary chat's model is told about the person's services, so "check my
 * Gmail" gets "Gmail isn't connected — connect it in Integrations" instead of "I
 * can't access email". Names only: this never attaches, grants or offers a tool.
 */
final class ConnectionNotes
{
    private const PUBLIC = ['deepwiki', 'hackernews'];

    public function __construct(private readonly Installs $installs, private readonly ConnectorOAuth $oauth) {}

    /**
     * @param array $requested the slugs the person @mentioned, as the client sent them
     * @param string[] $named the slugs actually attached to this turn
     */
    public function forChat(int $userId, array $requested, array $named): string
    {
        if (! config('chat_connectors.enabled')) return '';
        $installed = array_values(array_diff($this->installs->installed($userId), self::PUBLIC));
        $expired = array_values(array_filter($installed, fn ($slug) => $this->installs->needsReconnect($userId, $slug)));
        $unattached = $this->unattached($requested, $named);
        $notes = array_map(fn ($slug) => $this->why($slug, $installed, $expired), $unattached);
        if ($stale = array_diff($expired, $named, $unattached)) $notes[] = $this->names($stale).' '.$this->verb($stale)
            .' connected but the sign-in expired; it must be reconnected in Integrations before it can be used.';
        $idle = array_diff($installed, $named, $unattached, $expired);
        $notes[] = $idle ? 'Also connected, but only used when the person @mentions it: '.$this->names($idle).'.'
            : ($named ? '' : 'No accounts are connected.');
        $notes[] = 'If the person asks about any other service (email, calendar, files, GitHub and so on), say it is not connected '
            .'and that they can connect it in Integrations, then @mention it; never just say you have no access.';
        return "\n\nIntegrations: ".implode(' ', array_filter($notes));
    }

    /** Known catalogue slugs the person mentioned that did not reach this turn. */
    private function unattached(array $requested, array $named): array
    {
        $slugs = array_map(fn ($slug) => is_string($slug) ? strtolower(trim($slug)) : '', $requested);
        return array_values(array_unique(array_filter($slugs, fn ($slug) => $slug !== '' && ! in_array($slug, $named, true)
            && config('chat_connectors.catalogue.'.$slug) !== null)));
    }

    private function why(string $slug, array $installed, array $expired): string
    {
        $name = $this->names([$slug]);
        if (in_array($slug, $expired, true)) return $name.' was mentioned, but its sign-in expired: tell the person to reconnect it in Integrations.';
        if (in_array($slug, $installed, true)) return $name.' was mentioned but not attached, because only '
            .(int) config('chat_connectors.max_per_turn', 3).' services fit one message: suggest asking about it separately.';
        if (in_array($slug, self::PUBLIC, true)) return $name.' was mentioned but is switched off right now.';
        if (! $this->oauth->configured($slug)) return $name.' was mentioned, but Vibyra cannot connect it yet; say so plainly.';
        return $name.' was mentioned but is not connected: tell the person to connect it in Integrations, then mention it again.';
    }

    private function names(array $slugs): string
    {
        return implode(', ', array_map(fn ($slug) => (string) config('chat_connectors.catalogue.'.$slug.'.name', $slug), array_values($slugs)));
    }

    private function verb(array $slugs): string
    {
        return count($slugs) > 1 ? 'are' : 'is';
    }
}
