<?php
namespace App\Services\Remote;

use App\Models\{RemoteHost, User};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Libsodium sealed boxes prove possession of the existing X25519 private key. */
class RemoteIdentityProof
{
    public function challenge(User $user, int $sessionId, string $hostId, string $action): array
    {
        $host = RemoteHost::query()->where('host_id', $hostId)->first();
        if ($host && (string) $host->user_id !== (string) $user->id && $action !== 'transfer') {
            throw new RemoteAccessException('This computer needs an explicitly approved account transfer on the Mac.', 409, 'host_transfer_required');
        }
        if (! function_exists('sodium_crypto_box_seal')) throw new RemoteAccessException('Device verification is temporarily unavailable.', 503);
        if (DB::table('remote_identity_challenges')->where('app_session_id', $sessionId)
            ->whereNull('consumed_at')->where('expires_at', '>', now())->count() >= 5) {
            throw new RemoteAccessException('Wait two minutes before requesting another device verification.', 429);
        }
        $proof = random_bytes(32);
        try { $ciphertext = sodium_crypto_box_seal($proof, hex2bin($hostId)); }
        catch (\SodiumException) { throw new RemoteAccessException('Invalid computer identity.', 422); }
        $id = (string) Str::uuid();
        DB::table('remote_identity_challenges')->insert([
            'id' => $id, 'user_id' => $user->id, 'app_session_id' => $sessionId,
            'host_id' => $hostId, 'action' => $action, 'generation' => $host?->authorization_generation ?? 0,
            'proof_hash' => hash('sha256', $proof), 'expires_at' => now()->addSeconds(120),
        ]);
        return ['challengeId' => $id, 'ciphertext' => base64_encode($ciphertext), 'expiresIn' => 120];
    }

    /** Called inside the same transaction and host/account locks as enrollment. */
    public function consume(User $user, ?int $sessionId, string $hostId, ?RemoteHost $host, ?string $id, ?string $proof): void
    {
        if ($id === null || $proof === null) {
            throw new RemoteAccessException('Update Vibyra on this computer to reconnect securely.', 409, 'host_update_required');
        }
        $challenge = $id ? DB::table('remote_identity_challenges')->where('id', $id)->lockForUpdate()->first() : null;
        $bytes = is_string($proof) ? base64_decode($proof, true) : false;
        $moving = $host && (string) $host->user_id !== (string) $user->id;
        if (! $challenge || $challenge->consumed_at !== null || now()->gte($challenge->expires_at)
            || (string) $challenge->user_id !== (string) $user->id || (int) $challenge->app_session_id !== $sessionId
            || $challenge->host_id !== $hostId || (int) $challenge->generation !== ($host?->authorization_generation ?? 0)
            || ($moving && $challenge->action !== 'transfer') || $bytes === false || strlen($bytes) !== 32
            || ! hash_equals($challenge->proof_hash, hash('sha256', $bytes))) {
            throw new RemoteAccessException('Verify this computer again on the Mac before enrolling or transferring it.', 409);
        }
        DB::table('remote_identity_challenges')->where('id', $id)->update(['consumed_at' => now()]);
    }
}
