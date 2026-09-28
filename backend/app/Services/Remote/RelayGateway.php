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
     * Cuts a computer (and every phone on it) off the relay now. Best effort:
     * the tokens are short-lived, so a relay that cannot be reached only
     * delays revocation by minutes rather than defeating it.
     */
    public function disconnect(string $hostId, ?string $clientId = null): bool
    {
        $admin = $this->adminUrl();
        if ($admin === null) {
            return false;
        }
        try {
            $response = Http::withToken((string) config('remote.relay_secret'))->timeout(5)
                ->post("{$admin}/admin/disconnect", array_filter(['hostId' => $hostId, 'clientId' => $clientId]));

            return $response->ok() && $response->json('disconnected') === true;
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
