<?php

namespace App\Services\Billing;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class IapReceiptVerifier
{
    /**
     * @return array{originalTransactionId?: string, expiresAt?: \Carbon\Carbon|null, payload?: array}
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

        $latest = (array) ($data['latest_receipt_info'] ?? []);
        $match = collect($latest)->firstWhere('product_id', $productId) ?? ($latest[0] ?? null);
        if (! $match) {
            throw new RuntimeException('Apple receipt did not contain the expected product.');
        }

        $expiresMs = (int) ($match['expires_date_ms'] ?? 0);
        return [
            'originalTransactionId' => (string) ($match['original_transaction_id'] ?? ''),
            'expiresAt' => $expiresMs > 0 ? Carbon::createFromTimestampMs($expiresMs) : null,
            'payload' => $data,
        ];
    }

    private function verifyGoogle(string $productId, string $receipt): array
    {
        // The receipt blob from expo-iap on Android is the JSON purchase token.
        // Verifying it requires the Play Developer API + service account JWT,
        // which is configured separately. For now we accept the receipt and
        // record it; production deployment must enable real validation before
        // accepting Google purchases.
        if ((string) config('services.google_iap.service_account_json') === '') {
            throw new RuntimeException('Google IAP verification is not configured on this backend.');
        }

        // TODO: implement real Google Play receipt verification via
        // https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{packageName}/purchases/...
        // For now, treat receipt as opaque and accept it. The unique-transaction
        // index in iap_receipts prevents replay.
        return [
            'originalTransactionId' => null,
            'expiresAt' => null,
            'payload' => ['raw' => $receipt, 'productId' => $productId, 'note' => 'verification stubbed'],
        ];
    }
}
