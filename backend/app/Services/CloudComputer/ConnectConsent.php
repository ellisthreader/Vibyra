<?php
namespace App\Services\CloudComputer;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The account's agreement to connect to the cloud, given on the phone. Nothing cloud happens without it: no computer
 * is made, and the Mac treats it as its own sync consent. Every acceptance is kept as a legal record.
 */
final class ConnectConsent
{
    public function current(): int
    {
        return (int) config('cloud_workspaces.connect_consent_version', 2);
    }

    /** The newest acceptance that was not revoked. */
    public function latest(int $user): ?object
    {
        return DB::table('cloud_connect_consents')->where('user_id', $user)->whereNull('revoked_at')->orderByDesc('accepted_at')->orderByDesc('id')->first();
    }

    public function connected(int $user): bool
    {
        $c = $this->latest($user);
        return $c !== null && (int) $c->version >= $this->current();
    }

    public function record(int $user, int $version, string $source, Request $r): object
    {
        $ip = $r->ip();
        $id = DB::table('cloud_connect_consents')->insertGetId(['user_id' => $user, 'version' => $version, 'source' => $source, 'accepted_at' => now(),
            'user_agent' => Str::limit((string) $r->userAgent(), 252, '...') ?: null, 'ip_hash' => $ip ? hash('sha256', $ip.config('app.key')) : null,
            'created_at' => now(), 'updated_at' => now()]);
        return DB::table('cloud_connect_consents')->where('id', $id)->first();
    }

    /** Agreed once and withdrew it, with no newer agreement. An account that never agreed (an older computer) is not. */
    public function withdrawn(int $user): bool
    {
        return !$this->latest($user) && DB::table('cloud_connect_consents')->where('user_id', $user)->whereNotNull('revoked_at')->exists();
    }

    /** Withdraws every acceptance. Returns how many were open. */
    public function revoke(int $user): int
    {
        return DB::table('cloud_connect_consents')->where('user_id', $user)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
    }

    /** `{version, acceptedAt}` for the Mac, or null. */
    public function payload(int $user): ?array
    {
        $c = $this->latest($user);
        return $c ? ['version' => (int) $c->version, 'acceptedAt' => \Illuminate\Support\Carbon::parse($c->accepted_at)->toIso8601String()] : null;
    }
}
