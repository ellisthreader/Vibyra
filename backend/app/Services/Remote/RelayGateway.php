<?php

namespace App\Services\Remote;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/** The relay as this API sees it: its public address, and its admin surface. */
class RelayGateway
{
    public function __construct(private readonly RelayTokens $tokens)
    {
    }

    public function configured(): bool
    {
        return $this->publicUrl() !== null && $this->tokens->configured();
    }

    /** The wss:// address computers and phones connect to, or null when none is set. */
    public function publicUrl(): ?string
    {
        $url = trim((string) config('remote.relay_url'));
        if ($url === '' || ! preg_match('#^wss://[^\s/]+#', $url)) {
            return null;
        }

        return rtrim($url, '/');
    }

    /**
     * Cuts a computer (and every phone on it) off the relay now. Delivery failures remain in the durable outbox.
     * Authoritative renewal independently bounds existing authorization to 180 seconds.
     */
    public function disconnect(string $hostId, ?string $clientId = null, ?int $generation = null): bool
    {
        $admin = $this->adminUrl();
        if ($admin === null) {
            return false;
        }
        try {
            $response = Http::withToken((string) config('remote.relay_admin_secret', config('remote.relay_secret')))->connectTimeout(1)->timeout(2)
                ->post("{$admin}/admin/disconnect", array_filter(['hostId' => $hostId, 'clientId' => $clientId, 'generation' => $generation]));

            return $response->ok() && $response->json('disconnected') === true
                && ($generation === null || $response->json('generation') === $generation);
        } catch (\Throwable $error) {
            Log::warning('Relay disconnect failed.', ['hostId' => $hostId, 'error' => $error->getMessage()]);

            return false;
        }
    }

    private function adminUrl(): ?string
    {
        $configured = trim((string) config('remote.relay_admin_url'));
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        $public = $this->publicUrl();

        return $public === null ? null : preg_replace('#^wss://#', 'https://', $public);
    }
}
