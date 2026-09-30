<?php

namespace Tests\Support;

use App\Services\Remote\Passkeys\WebAuthnVerifier as Bytes;

/** A real ES256 authenticator for server boundary tests; no verifier mocks. */
class RemotePasskeyFixture
{
    public readonly string $id;
    private \OpenSSLAsymmetricKey $key;

    public function __construct(?\OpenSSLAsymmetricKey $key = null)
    {
        $this->id = random_bytes(32);
        $this->key = $key ?? openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
    }

    public function register(string $challenge, string $origin = 'https://remote.test', int $flags = 0x45): array
    {
        $details = openssl_pkey_get_details($this->key)['ec'];
        // COSE EC2 coordinates have fixed width; OpenSSL omits leading zeroes.
        $x = str_pad($details['x'], 32, "\0", STR_PAD_LEFT);
        $y = str_pad($details['y'], 32, "\0", STR_PAD_LEFT);
        $cose = hex2bin('a5010203262001215820').$x.hex2bin('225820').$y;
        $auth = hash('sha256', 'remote.test', true).chr($flags).pack('N', 0).str_repeat("\0", 16).pack('n', strlen($this->id)).$this->id.$cose;
        $attestation = hex2bin('a363666d74646e6f6e65686175746844617461').$this->bytes($auth).hex2bin('6761747453746d74a0');
        return $this->credential(['clientDataJSON' => Bytes::encode($this->client('webauthn.create', $challenge, $origin)),
            'attestationObject' => Bytes::encode($attestation), 'transports' => ['internal']]);
    }

    public function authenticate(string $challenge, int $counter = 1, string $origin = 'https://remote.test', int $flags = 5): array
    {
        $client = $this->client('webauthn.get', $challenge, $origin);
        $auth = hash('sha256', 'remote.test', true).chr($flags).pack('N', $counter);
        openssl_sign($auth.hash('sha256', $client, true), $signature, $this->key, OPENSSL_ALGO_SHA256);
        return $this->credential(['clientDataJSON' => Bytes::encode($client),
            'authenticatorData' => Bytes::encode($auth), 'signature' => Bytes::encode($signature)]);
    }

    private function client(string $type, string $challenge, string $origin): string
    {
        return json_encode(['type' => $type, 'challenge' => Bytes::encode($challenge), 'origin' => $origin, 'crossOrigin' => false]);
    }

    private function credential(array $response): array
    {
        return ['id' => Bytes::encode($this->id), 'rawId' => Bytes::encode($this->id), 'type' => 'public-key', 'response' => $response];
    }

    private function bytes(string $value): string
    {
        $length = strlen($value);
        return ($length < 256 ? "\x58".chr($length) : "\x59".pack('n', $length)).$value;
    }
}
