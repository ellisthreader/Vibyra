<?php

namespace App\Services\Billing;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class IapReceiptVerifier
{
    public function __construct(
        private readonly GooglePlayReceiptVerifier $googlePlayVerifier
    ) {}

    /**
     * @return array{
     *     transactionId: string,
     *     originalTransactionId: string,
     *     productId: string,
     *     environment: string,
     *     state: string,
     *     expiresAt: \Carbon\Carbon|null,
     *     payload: array
     * }
     */
    public function verify(string $platform, string $productId, string $receipt): array
    {
        if ($platform === 'apple') {
            return $this->verifyApple($productId, $receipt);
        }
        if ($platform === 'google') {
            return $this->verifyGoogle($productId, $receipt);
        }
        throw new RuntimeException('Unsupported IAP platform.');
    }

    private function verifyApple(string $productId, string $receipt): array
    {
        $body = [
            'receipt-data' => $receipt,
            'password' => (string) config('services.apple_iap.shared_secret'),
            'exclude-old-transactions' => true,
        ];

        $url = (string) config('services.apple_iap.verify_url');
        $response = Http::timeout(15)->acceptJson()->post($url, $body);
        $data = (array) $response->json();
        $status = (int) ($data['status'] ?? -1);

        if ($status === 21007) {
            $sandboxUrl = (string) config('services.apple_iap.sandbox_url');
            $response = Http::timeout(15)->acceptJson()->post($sandboxUrl, $body);
            $data = (array) $response->json();
            $status = (int) ($data['status'] ?? -1);
        }

        if ($status !== 0) {
            throw new RuntimeException("Apple receipt validation failed (status {$status}).");
        }

        $entries = array_merge(
            (array) ($data['latest_receipt_info'] ?? []),
            (array) data_get($data, 'receipt.in_app', [])
        );
        $matches = collect($entries)
            ->filter(fn ($entry) => is_array($entry)
                && hash_equals($productId, (string) ($entry['product_id'] ?? '')))
            ->sortByDesc(fn (array $entry) => (int) (
                $entry['expires_date_ms']
                ?? $entry['purchase_date_ms']
                ?? 0
            ));
        $match = $matches->first();
        if (! is_array($match)) {
            throw new RuntimeException('Apple receipt did not contain the expected product.');
        }

        $transactionId = trim((string) ($match['transaction_id'] ?? ''));
        $originalTransactionId = trim((string) (
            $match['original_transaction_id']
            ?? $transactionId
        ));
        if ($transactionId === '' || $originalTransactionId === '') {
            throw new RuntimeException('Apple receipt did not contain canonical transaction identifiers.');
        }

        $expiresMs = (int) ($match['expires_date_ms'] ?? 0);
        $expiresAt = $expiresMs > 0 ? Carbon::createFromTimestampMs($expiresMs) : null;
        if ($expiresAt !== null && $expiresAt->isPast()) {
            throw new RuntimeException('Apple subscription receipt has expired.');
        }

        return [
            'transactionId' => $transactionId,
            'originalTransactionId' => $originalTransactionId,
            'productId' => (string) $match['product_id'],
            'environment' => strtolower((string) ($data['environment'] ?? 'production')),
            'state' => $expiresAt === null ? 'purchased' : 'active',
            'expiresAt' => $expiresAt,
            'payload' => $data,
        ];
    }

    private function verifyGoogle(string $productId, string $receipt): array
    {
        return $this->googlePlayVerifier->verify($productId, $receipt);
    }
}
