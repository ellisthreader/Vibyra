<?php

namespace App\Services\Remote;

use App\Models\RemoteAuditEvent;
use App\Models\RemoteHost;
use App\Models\RemoteSession;
use Carbon\CarbonImmutable;

/**
 * What the relay tells this API, applied to the registry: computers coming and
 * going, and the sessions phones open on them. Events name only ids; a host id
 * this account never registered is ignored rather than created.
 */
class RemotePresence
{
    /** @param list<array<string,mixed>> $events */
    public function ingest(string $relayId, array $events): int
    {
        $applied = 0;
        foreach (array_slice($events, 0, 500) as $event) {
            if (! is_array($event) || ! is_string($event['event'] ?? null)) {
                continue;
            }
            $applied += match ($event['event']) {
                'host.online' => $this->online($relayId, $event, true),
                'host.offline' => $this->offline($event),
                'presence' => $this->heartbeat($relayId, $event),
                'session.started' => $this->session($event, true),
                'session.ended' => $this->session($event, false),
                default => 0,
            };
        }

        return $applied;
    }

    private function online(string $relayId, array $event, bool $record): int
    {
        $host = $this->host($event['hostId'] ?? null);
        if ($host === null) {
            return 0;
        }
        $now = CarbonImmutable::now();
        $host->forceFill(['last_seen_at' => $now, 'online_until' => $now->addSeconds((int) config('remote.presence_seconds')),
            'relay_id' => mb_substr($relayId, 0, 80)])->save();
        if ($record) {
            $this->audit($host, 'host.online');
        }

        return 1;
    }

    private function offline(array $event): int
    {
        $host = $this->host($event['hostId'] ?? null);
        if ($host === null) {
            return 0;
        }
        $host->forceFill(['last_seen_at' => now(), 'online_until' => null])->save();
        $this->audit($host, 'host.offline');

        return 1;
    }

    private function heartbeat(string $relayId, array $event): int
    {
        $applied = 0;
        foreach (array_slice(is_array($event['hosts'] ?? null) ? $event['hosts'] : [], 0, 500) as $entry) {
            if (is_array($entry)) {
                $applied += $this->online($relayId, $entry, false);
            }
        }

        return $applied;
    }

    private function session(array $event, bool $started): int
    {
        $host = $this->host($event['hostId'] ?? null);
        $grant = is_string($event['jti'] ?? null) ? $event['jti'] : null;
        if ($host === null || $grant === null) {
            return 0;
        }
        $session = RemoteSession::query()->where('remote_host_id', $host->id)->where('grant_id', $grant)->first();
        if ($session === null) {
            return 0;
        }
        $clientId = is_string($event['clientId'] ?? null) ? mb_substr($event['clientId'], 0, 40) : null;
        $session->forceFill($started
            ? ['started_at' => now(), 'relay_client_id' => $clientId]
            : ['ended_at' => now()])->save();
        $this->audit($host, $started ? 'session.started' : 'session.ended', ['client' => $session->client_name]);

        return 1;
    }

    private function host(mixed $hostId): ?RemoteHost
    {
        if (! is_string($hostId) || ! preg_match('/^[a-f0-9]{64}$/', $hostId)) {
            return null;
        }

        return RemoteHost::query()->where('host_id', $hostId)->whereNull('revoked_at')->first();
    }

    public function audit(RemoteHost $host, string $event, array $detail = []): void
    {
        RemoteAuditEvent::create(['user_id' => $host->user_id, 'remote_host_id' => $host->id, 'event' => $event,
            'detail' => $detail + ['computer' => $host->name], 'created_at' => now()]);
    }
}
