<?php

namespace App\Services\Billing;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class GooglePlayReceiptVerifier
{
    public function __construct(
        private readonly GooglePlayAccessTokenProvider $accessTokenProvider
    ) {}

    /**
     * @return array{
     *     transactionId: string,
     *     originalTransactionId: string,
     *     productId: string,
     *     environment: string,
     *     state: string,
     *     expiresAt: Carbon|null,
     *     payload: array
     * }
     */
    public function verify(string $productId, string $purchaseToken): array
    {
        $packageName = trim((string) config('services.google_iap.package_name'));
        if ($packageName === '') {
            throw new RuntimeException('Google IAP package name is not configured.');
        }

        $product = (array) ((array) config('billing.iap_products', []))[$productId] ?? [];
        $kind = (string) ($product['kind'] ?? '');
        if (! in_array($kind, ['subscription', 'topup'], true)) {
            throw new RuntimeException('Google IAP product is not configured.');
        }

        $url = $kind === 'subscription'
            ? $this->subscriptionUrl($packageName, $purchaseToken)
            : $this->productUrl($packageName, $productId, $purchaseToken);
        $response = Http::timeout(15)
            ->acceptJson()
            ->withToken($this->accessTokenProvider->token())
            ->get($url);

        if (! $response->successful()) {
            throw new RuntimeException(
                "Google Play receipt validation failed (status {$response->status()})."
            );
        }

        $payload = (array) $response->json();

        return $kind === 'subscription'
            ? $this->validateSubscription($productId, $purchaseToken, $payload)
            : $this->validateProduct($productId, $purchaseToken, $payload);
    }

    /**
     * @return array{
     *     transactionId: string,
     *     originalTransactionId: string,
     *     productId: string,
     *     environment: string,
     *     state: string,
     *     expiresAt: Carbon,
     *     payload: array
     * }
     */
    private function validateSubscription(string $productId, string $purchaseToken, array $payload): array
    {
        $lineItem = collect((array) ($payload['lineItems'] ?? []))
            ->first(fn ($item) => (string) ($item['productId'] ?? '') === $productId);
        if (! is_array($lineItem)) {
            throw new RuntimeException('Google Play subscription did not contain the expected product.');
        }

        $state = (string) ($payload['subscriptionState'] ?? '');
        $entitledStates = [
            'SUBSCRIPTION_STATE_ACTIVE',
            'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
            'SUBSCRIPTION_STATE_CANCELED',
        ];
        if (! in_array($state, $entitledStates, true)) {
            throw new RuntimeException("Google Play subscription is not active ({$state}).");
        }

        $expiresAt = $this->parseExpiry((string) ($lineItem['expiryTime'] ?? ''));
        if ($expiresAt->isPast()) {
            throw new RuntimeException('Google Play subscription has expired.');
        }

        $transactionId = trim((string) (
            $lineItem['latestSuccessfulOrderId']
            ?? $payload['latestOrderId']
            ?? ''
        ));
        if ($transactionId === '') {
            throw new RuntimeException('Google Play subscription did not include a canonical order ID.');
        }

        return [
            'transactionId' => $transactionId,
            'originalTransactionId' => preg_replace('/\.\.\d+$/', '', $transactionId) ?: $transactionId,
            'productId' => $productId,
            'environment' => isset($payload['testPurchase']) ? 'sandbox' : 'production',
            'state' => $state,
            'expiresAt' => $expiresAt,
            'payload' => $payload,
        ];
    }

    /**
     * @return array{
     *     transactionId: string,
     *     originalTransactionId: string,
     *     productId: string,
     *     environment: string,
     *     state: string,
     *     expiresAt: null,
     *     payload: array
     * }
     */
    private function validateProduct(string $productId, string $purchaseToken, array $payload): array
    {
        $verifiedProductId = (string) ($payload['productId'] ?? '');
        if ($verifiedProductId !== '' && $verifiedProductId !== $productId) {
            throw new RuntimeException('Google Play purchase did not contain the expected product.');
        }
        if ((int) ($payload['purchaseState'] ?? -1) !== 0) {
            throw new RuntimeException('Google Play purchase is not in the purchased state.');
        }
        if ((int) ($payload['quantity'] ?? 1) < 1) {
            throw new RuntimeException('Google Play purchase quantity is invalid.');
        }

        $transactionId = trim((string) ($payload['orderId'] ?? ''));
        if ($transactionId === '') {
            throw new RuntimeException('Google Play purchase did not include a canonical order ID.');
        }

        return [
            'transactionId' => $transactionId,
            'originalTransactionId' => $transactionId,
            'productId' => $productId,
            'environment' => isset($payload['testPurchase']) ? 'sandbox' : 'production',
            'state' => 'purchased',
            'expiresAt' => null,
            'payload' => $payload,
        ];
    }

    private function parseExpiry(string $expiry): Carbon
    {
        if ($expiry === '') {
            throw new RuntimeException('Google Play subscription did not include an expiry time.');
        }

        try {
            return Carbon::parse($expiry);
        } catch (\Throwable) {
            throw new RuntimeException('Google Play subscription expiry time is invalid.');
        }
    }

    private function subscriptionUrl(string $packageName, string $token): string
    {
        return $this->apiUrl().'/applications/'.rawurlencode($packageName)
            .'/purchases/subscriptionsv2/tokens/'.rawurlencode($token);
    }

    private function productUrl(string $packageName, string $productId, string $token): string
    {
        return $this->apiUrl().'/applications/'.rawurlencode($packageName)
            .'/purchases/products/'.rawurlencode($productId).'/tokens/'.rawurlencode($token);
    }

    private function apiUrl(): string
    {
        return rtrim((string) config(
            'services.google_iap.api_url',
            'https://androidpublisher.googleapis.com/androidpublisher/v3'
        ), '/');
    }
}
