<?php
namespace App\Services\CloudComputer;

use App\Models\VibyraSession;
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Support\Str;

/**
 * Face ID for "Connect to cloud", without a web page. At sign-in the phone makes an X25519 key, keeps the private half
 * in the Keychain behind Face ID and registers the public half here, bound to the new session. Connect then needs the
 * answer to a random value sealed to that key (`sodium_crypto_box_seal`, the same proof the phone already gives for a
 * device), which the phone can only open after Face ID. A stolen session token cannot register a key (too late after
 * sign-in, and one per session) and cannot answer the challenge (no face, no Keychain).
 */
final class FaceKeys
{
    /** How long after sign-in the phone may register its key. */
    public const ENROLL_SECONDS = 600;
    private const CHALLENGE_SECONDS = 120;

    public function required(): bool
    {
        return (bool) config('cloud_workspaces.connect_requires_face', true);
    }

    public function enroll(VibyraSession $session, string $publicKey): void
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $publicKey)) Computers::fail('invalid_request', 'That Face ID key is not valid.', 422);
        if (DB::table('cloud_face_keys')->where('session_id', $session->id)->exists()) Computers::fail('face_key_exists', 'This sign-in already has a Face ID key.', 409);
        if ($session->created_at === null || $session->created_at->lt(now()->subSeconds(self::ENROLL_SECONDS))) {
            Computers::fail('face_sign_in_required', 'Sign out and sign in again on this iPhone to use Face ID for Vibyra Cloud.', 409);
        }
        DB::table('cloud_face_keys')->insert(['user_id' => $session->user_id, 'session_id' => $session->id, 'public_key' => $publicKey,
            'created_at' => now(), 'updated_at' => now()]);
    }

    /** A random value sealed to this session's key, to open after Face ID. */
    public function challenge(VibyraSession $session): array
    {
        $key = DB::table('cloud_face_keys')->where('session_id', $session->id)->value('public_key')
            ?? Computers::fail('face_sign_in_required', 'Sign out and sign in again on this iPhone to use Face ID for Vibyra Cloud.', 409);
        $secret = random_bytes(32);
        $id = (string) Str::uuid();
        Cache::put($this->slot($id), ['session' => $session->id, 'hash' => hash('sha256', $secret)], self::CHALLENGE_SECONDS);
        return ['id' => $id, 'ciphertext' => base64_encode(sodium_crypto_box_seal($secret, hex2bin($key)))];
    }

    /** Refuses unless `face` answers a live challenge of this very session; each challenge works once. */
    public function verify(VibyraSession $session, mixed $face): void
    {
        $refuse = fn () => Computers::fail('face_required', 'Confirm with Face ID to connect.', 403);
        if (!is_array($face) || !is_string($face['id'] ?? null) || !Str::isUuid($face['id']) || !is_string($face['proof'] ?? null)) $refuse();
        $held = Cache::pull($this->slot($face['id']));
        $bytes = base64_decode($face['proof'], true);
        if (!is_array($held) || (int) $held['session'] !== (int) $session->id || $bytes === false || strlen($bytes) !== 32
            || !hash_equals($held['hash'], hash('sha256', $bytes))) $refuse();
    }

    private function slot(string $id): string
    {
        return 'cloud-face-challenge:'.$id;
    }
}
