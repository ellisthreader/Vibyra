<?php

namespace App\Services\Vibes;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class AppleStore
{
    public function transaction(string $id): array
    {
        abort_unless(preg_match('/^[0-9]{1,40}$/', $id), 422, 'Invalid transaction.');
        $data = $this->get('/inApps/v1/transactions/'.$id);
        // This JWS comes directly from Apple's authenticated HTTPS API, never the phone.
        $transaction = $this->payload($data['signedTransactionInfo'] ?? '');
        abort_unless(($transaction['transactionId'] ?? '') === $id, 502, 'Apple returned a different transaction.');
        return $transaction;
    }

    public function subscriptions(string $original): array
    {
        $data = $this->get('/inApps/v1/subscriptions/'.rawurlencode($original));
        $transactions = [];
        foreach ($data['data'] ?? [] as $group) {
            foreach ($group['lastTransactions'] ?? [] as $item) {
                $transactions[] = $this->payload($item['signedTransactionInfo'] ?? '');
            }
        }
        return $transactions;
    }

    public function history(string $id): \Generator
    {
        $query = ['sort' => 'ASCENDING'];
        do {
            $data = $this->get('/inApps/v2/history/'.rawurlencode($id), $query);
            foreach ($data['signedTransactions'] ?? [] as $jws) yield $this->payload($jws);
            if (empty($data['hasMore'])) return;
            abort_unless(is_string($data['revision'] ?? null) && ($query['revision'] ?? '') !== $data['revision'], 502, 'Invalid Apple history cursor.');
            $query['revision'] = $data['revision'];
        } while (true);
    }

    private function get(string $path, array $query = []): array
    {
        $sandbox = config('vibes.apple_environment') === 'Sandbox';
        $url = $sandbox ? 'https://api.storekit-sandbox.apple.com' : 'https://api.storekit.apple.com';
        $r = Http::withToken($this->token())->acceptJson()->timeout(15)->get($url.$path, $query);
        abort_unless($r->successful(), 502, 'Apple could not verify this purchase yet. Please try Restore Purchases.');
        return $r->json();
    }

    private function payload(string $jws): array
    {
        $parts = explode('.', $jws);
        if (count($parts) !== 3) throw new RuntimeException('Invalid Apple API response.');
        $data = json_decode(base64_decode(strtr($parts[1], '-_', '+/'), true), true, flags: JSON_THROW_ON_ERROR);
        abort_unless(($data['bundleId'] ?? null) === config('vibes.apple_bundle_id')
            && ($data['environment'] ?? null) === config('vibes.apple_environment'), 422, 'Wrong purchase environment or application.');
        return $data;
    }

    private function token(): string
    {
        $key = config('vibes.apple_private_key');
        abort_unless($key && config('vibes.apple_key_id') && config('vibes.apple_issuer'), 503, 'Purchases are not configured yet.');
        return app(AppleJwt::class)->sign($key, (string) config('vibes.apple_key_id'), [
            'iss' => config('vibes.apple_issuer'), 'iat' => time(), 'exp' => time() + 300,
            'aud' => 'appstoreconnect-v1', 'bid' => config('vibes.apple_bundle_id'),
        ]);
    }
}
