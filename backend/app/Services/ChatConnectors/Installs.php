<?php

namespace App\Services\ChatConnectors;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * What one account has connected. The credential is encrypted with the
 * application key on the way in and is never returned to a client: what the
 * install page shows is the account label the provider itself reported.
 */
class Installs
{
    public function __construct(private readonly Registry $registry, private readonly ConnectorOAuth $oauth) {}

    /** @return array<string, object> install rows keyed by integration slug */
    public function all(int $userId): array
    {
        return DB::table('vibes_integration_installs')->where('user_id', $userId)->get()->keyBy('integration')->all();
    }

    /** Slugs this account can actually use, ignoring rows for retired integrations. */
    public function installed(int $userId): array
    {
        $installed = array_values(array_intersect(array_keys($this->all($userId)), $this->registry->slugs()));
        foreach (['deepwiki', 'hackernews'] as $slug) {
            if ($this->publicReady($slug) && $this->registry->has($slug)) $installed[] = $slug;
        }
        return $installed;
    }

    /**
     * Store a pasted key only after it has proved it reaches an account, so a
     * mistyped key is refused here rather than in the middle of someone's reply.
     */
    public function connect(int $userId, string $slug, string $credential, array $grant = []): void
    {
        abort_if(in_array($slug, ['deepwiki', 'hackernews'], true), 422,
            'This public integration needs no account connection.');
        try { $label = $this->registry->for($slug)->connect($credential); }
        // A key refused on first use is a wrong key, not an expired sign-in to reconnect.
        catch (ReconnectRequired $e) { abort(422, (string) config('chat_connectors.catalogue.'.$slug.'.name', $slug).' refused that sign-in. Check it and try again.'); }
        catch (\Throwable $e) { abort(422, $e->getMessage()); }
        $where = ['user_id' => $userId, 'integration' => $slug];
        $values = ['credential' => Crypt::encryptString($credential), 'account_label' => $label,
            'refresh_token' => isset($grant['refresh']) && is_string($grant['refresh'])
                ? Crypt::encryptString($grant['refresh']) : null,
            'expires_at' => isset($grant['expires_in']) && is_int($grant['expires_in'])
                ? now()->addSeconds($grant['expires_in']) : null,
            'connected_at' => now(), 'updated_at' => now()];
        Cache::forget($this->reconnectKey($userId, $slug));
        InstallStore::put($where, $values);
    }

    public function disconnect(int $userId, string $slug): void
    {
        $this->revokeAtProvider($userId, $slug);
        abort_if(in_array($slug, ['deepwiki', 'hackernews'], true), 422,
            'This public integration has no account to disconnect. Remove teammate access instead.');
        DB::transaction(function () use ($userId, $slug) {
            DB::table('vibes_integration_installs')->where('user_id', $userId)->where('integration', $slug)->delete();
            $this->revokeGrants($userId, $slug);
        });
        Cache::forget($this->reconnectKey($userId, $slug));
    }

    /**
     * Deleting our copy of a credential does not end a grant the provider keeps (Stripe lists the platform on the
     * person's Dashboard until it is deauthorized). Asked first, best effort: a provider that is down never blocks disconnecting.
     */
    private function revokeAtProvider(int $userId, string $slug): void
    {
        try {
            $row = DB::table('vibes_integration_installs')->where('user_id', $userId)->where('integration', $slug)->first();
            $connector = $row && $this->registry->has($slug) ? $this->registry->for($slug) : null;
            if ($connector instanceof Revocable) $connector->revoke(Crypt::decryptString($row->credential));
        } catch (\Throwable $e) { Log::info('Connector revoke skipped', ['slug' => $slug, 'error' => class_basename($e)]); }
    }

    /**
     * A teammate must never be granted a service its person no longer has. Each row that
     * held the slug loses it and takes a new revision, so a turn or approval quoted
     * before the disconnect fails `TaskContext::validate` instead of running on.
     */
    private function revokeGrants(int $userId, string $slug): void
    {
        $rows = DB::table('agent_teammates')->where('user_id', $userId)->where('integrations', 'like', '%'.$slug.'%')->get(['id', 'chat_id', 'integrations']);
        foreach ($rows as $row) {
            $held = (array) json_decode($row->integrations, true);
            if (! in_array($slug, $held, true)) continue;
            DB::table('agent_teammates')->where('id', $row->id)->update([
                'integrations' => json_encode(array_values(array_diff($held, [$slug]))),
                'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
            DB::table('vibes_chats')->where('id', $row->chat_id)->increment('revision');
        }
    }

    /** Whether the provider recently refused to renew this connection for good. */
    public function needsReconnect(int $userId, string $slug): bool
    {
        return Cache::has($this->reconnectKey($userId, $slug));
    }

    private function reconnectKey(int $userId, string $slug): string
    {
        return 'chat-connectors:reconnect:'.$userId.':'.$slug;
    }

    /** The stored key for one call, decrypted only for as long as that call takes. */
    public function credential(int $userId, string $slug, ?array $expected = null): string
    {
        if (in_array($slug, ['deepwiki', 'hackernews'], true)) {
            abort_unless($this->publicReady($slug), 422, 'This public integration is unavailable.');
            return '';
        }
        return DB::transaction(function () use ($userId, $slug, $expected) {
            // Ordinary chat and Agent V2 share this lock, including the refresh request.
            $row = DB::table('vibes_integration_installs')->where('user_id', $userId)->where('integration', $slug)->lockForUpdate()->first();
            $name = (string) config('chat_connectors.catalogue.'.$slug.'.name', $slug);
            abort_unless($row, 422, 'Connect '.$name.' before using it.');
            if ($expected !== null) foreach ($expected as $key => $value) {
                if ((string) $row->$key !== (string) $value)
                    throw \App\Services\AgentRuns\Tools\Providers\ToolFailure::refused('access_changed', 'The connected account changed. Prepare this action again.');
            }
            DB::table('vibes_integration_installs')->where('id', $row->id)->update(['last_used_at' => now()]);
            return $this->fresh($row, $slug, $userId) ?? Crypt::decryptString($row->credential);
        });
    }

    private function publicReady(string $slug): bool
    {
        if (!config('chat_connectors.enabled')) return false;
        return match ($slug) {
            'deepwiki' => (bool) config('chat_connectors.public_mcp_enabled'),
            'hackernews' => (bool) (config('chat_connectors.composio_public_enabled')
                && config('chat_connectors.composio_api_key')),
            default => false,
        };
    }

    /**
     * The access token to actually call with, renewed first when it is close
     * enough to expiry to be worthless. A provider that issues no refresh token,
     * and a token with no expiry recorded, both skip this entirely.
     */
    private function fresh(object $row, string $slug, int $userId): ?string
    {
        if (!$row->refresh_token || !$row->expires_at || !$this->oauth->renewable($slug)) return null;
        if (Carbon::parse($row->expires_at)->isAfter(now()->addMinutes(ConnectorTokens::renewalMarginMinutes($slug)))) return null;
        try { $grant = $this->oauth->renew($slug, Crypt::decryptString($row->refresh_token)); }
        catch (ReconnectRequired $e) {
            // Kept for a day: a later failing call names the fix instead of an outage. The
            // stored token is still handed back, to fail on the provider's own terms.
            Cache::put($this->reconnectKey($userId, $slug), true, now()->addDay());
            return null;
        }
        catch (\Throwable $e) { return null; }
        if (!$grant) return null;
        Cache::forget($this->reconnectKey($userId, $slug));
        DB::table('vibes_integration_installs')->where('id', $row->id)->update([
            'credential' => Crypt::encryptString($grant['access']),
            'refresh_token' => is_string($grant['refresh']) ? Crypt::encryptString($grant['refresh']) : $row->refresh_token,
            'expires_at' => is_int($grant['expires_in']) ? now()->addSeconds($grant['expires_in']) : null,
            'updated_at' => now(),
        ]);
        return $grant['access'];
    }
}
