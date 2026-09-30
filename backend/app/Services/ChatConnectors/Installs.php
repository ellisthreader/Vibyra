<?php

namespace App\Services\ChatConnectors;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * What one account has connected. The credential is encrypted with the
 * application key on the way in and is never returned to a client: what the
 * install page shows is the account label the provider itself reported.
 */
class Installs
{
    /** Renewed this far ahead of expiry, so a long reply never runs out mid-call. */
    private const RENEW_MARGIN_MINUTES = 60;

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
        catch (\Throwable $e) { abort(422, $e->getMessage()); }
        $where = ['user_id' => $userId, 'integration' => $slug];
        $values = ['credential' => Crypt::encryptString($credential), 'account_label' => $label,
            'refresh_token' => isset($grant['refresh']) && is_string($grant['refresh'])
                ? Crypt::encryptString($grant['refresh']) : null,
            'expires_at' => isset($grant['expires_in']) && is_int($grant['expires_in'])
                ? now()->addSeconds($grant['expires_in']) : null,
            'connected_at' => now(), 'updated_at' => now()];
        if (DB::table('vibes_integration_installs')->where($where)->exists()) {
            DB::table('vibes_integration_installs')->where($where)->update($values);
            return;
        }
        DB::table('vibes_integration_installs')->insert([...$where, ...$values, 'created_at' => now()]);
    }

    public function disconnect(int $userId, string $slug): void
    {
        abort_if(in_array($slug, ['deepwiki', 'hackernews'], true), 422,
            'This public integration has no account to disconnect. Remove teammate access instead.');
        DB::table('vibes_integration_installs')->where('user_id', $userId)->where('integration', $slug)->delete();
    }

    /** The stored key for one call, decrypted only for as long as that call takes. */
    public function credential(int $userId, string $slug): string
    {
        if (in_array($slug, ['deepwiki', 'hackernews'], true)) {
            abort_unless($this->publicReady($slug), 422, 'This public integration is unavailable.');
            return '';
        }
        $row = DB::table('vibes_integration_installs')->where('user_id', $userId)->where('integration', $slug)->first();
        $name = (string) config('chat_connectors.catalogue.'.$slug.'.name', $slug);
        abort_unless($row, 422, 'Connect '.$name.' before using it.');
        DB::table('vibes_integration_installs')->where('id', $row->id)->update(['last_used_at' => now()]);
        return $this->fresh($row, $slug) ?? Crypt::decryptString($row->credential);
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
    private function fresh(object $row, string $slug): ?string
    {
        if (!$row->refresh_token || !$row->expires_at || !$this->oauth->renewable($slug)) return null;
        if (Carbon::parse($row->expires_at)->isAfter(now()->addMinutes(self::RENEW_MARGIN_MINUTES))) return null;
        try { $grant = $this->oauth->renew($slug, Crypt::decryptString($row->refresh_token)); }
        catch (\Throwable $e) { return null; }
        if (!$grant) return null;
        DB::table('vibes_integration_installs')->where('id', $row->id)->update([
            'credential' => Crypt::encryptString($grant['access']),
            'refresh_token' => is_string($grant['refresh']) ? Crypt::encryptString($grant['refresh']) : $row->refresh_token,
            'expires_at' => is_int($grant['expires_in']) ? now()->addSeconds($grant['expires_in']) : null,
            'updated_at' => now(),
        ]);
        return $grant['access'];
    }
}
