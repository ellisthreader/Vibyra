<?php

namespace App\Services\Remote;

use App\Models\{RemoteHost, VibyraSession};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RemoteHostSecurityProof
{
    public function issue(VibyraSession $session, RemoteHost $host, string $purpose, string $resource, array $parameters): array
    {
        if (DB::table('remote_host_security_challenges')->where('app_session_id', $session->id)
            ->whereNull('consumed_at')->where('expires_at', '>', now())->count() >= 5) {
            throw new RemoteAccessException('Wait two minutes before requesting another verification.', 429);
        }
        $nonce = random_bytes(32); $id = (string) Str::uuid();
        $ciphertext = sodium_crypto_box_seal($nonce, hex2bin($host->host_id));
        DB::table('remote_host_security_challenges')->insert(['id' => $id, 'user_id' => $session->user_id,
            'remote_host_id' => $host->id, 'app_session_id' => $session->id, 'authorization_generation' => $host->authorization_generation,
            'purpose' => $purpose, 'resource' => $resource, 'parameters_hash' => $this->hash($parameters),
            'proof_hash' => hash('sha256', $nonce), 'expires_at' => now()->addSeconds(120)]);
        return ['challengeId' => $id, 'ciphertext' => base64_encode($ciphertext), 'hostId' => $host->host_id,
            'purpose' => $purpose, 'resource' => $resource, 'parameters' => $parameters, 'expiresIn' => 120];
    }

    public function consume(VibyraSession $session, RemoteHost $host, string $purpose, string $resource, array $parameters, string $id, string $proof): void
    {
        $challenge = Str::isUuid($id) ? DB::table('remote_host_security_challenges')->where('id', $id)->lockForUpdate()->first() : null;
        $nonce = base64_decode($proof, true);
        if (! $challenge || $challenge->consumed_at || now()->gte($challenge->expires_at)
            || (int) $challenge->user_id !== (int) $session->user_id || (int) $challenge->app_session_id !== $session->id
            || (int) $challenge->remote_host_id !== $host->id || (int) $challenge->authorization_generation !== $host->authorization_generation
            || $challenge->purpose !== $purpose || $challenge->resource !== $resource
            || ! hash_equals($challenge->parameters_hash, $this->hash($parameters))
            || $nonce === false || strlen($nonce) !== 32 || ! hash_equals($challenge->proof_hash, hash('sha256', $nonce))) {
            throw new RemoteAccessException('Computer verification expired or was already used.', 403, 'host_proof_invalid');
        }
        if (DB::table('remote_host_security_challenges')->where('id', $id)->whereNull('consumed_at')->update(['consumed_at' => now()]) !== 1) {
            throw new RemoteAccessException('Computer verification was already used.', 403, 'host_proof_invalid');
        }
    }

    private function hash(array $parameters): string
    {
        return hash('sha256', json_encode($parameters, JSON_THROW_ON_ERROR));
    }
}
