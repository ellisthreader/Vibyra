<?php

namespace Tests\Unit;

use App\Services\Billing\IapReceiptVerifier;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class IapReceiptVerifierTest extends TestCase
{
    public function test_expired_apple_subscription_is_rejected(): void
    {
        config([
            'services.apple_iap.shared_secret' => 'secret',
            'services.apple_iap.verify_url' => 'https://apple.test/verify',
        ]);
        Http::fake([
            'https://apple.test/verify' => Http::response([
                'status' => 0,
                'latest_receipt_info' => [[
                    'product_id' => 'app.vibyra.membership.pro.monthly',
                    'transaction_id' => 'apple-renewal-1',
                    'original_transaction_id' => 'apple-original-1',
                    'expires_date_ms' => '1000',
                ]],
            ]),
        ]);

        $this->expectExceptionMessage('Apple subscription receipt has expired.');
        app(IapReceiptVerifier::class)->verify(
            'apple',
            'app.vibyra.membership.pro.monthly',
            'receipt'
        );
    }

    public function test_google_subscription_is_verified_with_the_play_developer_api(): void
    {
        $this->configureGoogleIap();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'play-access-token',
            ]),
            'https://play.test/applications/app.vibyra/purchases/subscriptionsv2/tokens/sub-token' => Http::response([
                'subscriptionState' => 'SUBSCRIPTION_STATE_ACTIVE',
                'lineItems' => [[
                    'productId' => 'app.vibyra.membership.pro.monthly',
                    'expiryTime' => now()->addMonth()->toIso8601String(),
                    'latestSuccessfulOrderId' => 'GPA.subscription-order',
                ]],
            ]),
        ]);

        $verified = app(IapReceiptVerifier::class)->verify(
            'google',
            'app.vibyra.membership.pro.monthly',
            'sub-token'
        );

        $this->assertSame('GPA.subscription-order', $verified['originalTransactionId']);
        $this->assertSame('GPA.subscription-order', $verified['transactionId']);
        $this->assertSame('app.vibyra.membership.pro.monthly', $verified['productId']);
        $this->assertTrue($verified['expiresAt']->isFuture());
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer play-access-token'));
    }

    public function test_google_topup_is_verified_with_the_product_endpoint(): void
    {
        $this->configureGoogleIap();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'play-access-token',
            ]),
            'https://play.test/applications/app.vibyra/purchases/products/app.vibyra.topup.500/tokens/topup-token' => Http::response([
                'productId' => 'app.vibyra.topup.500',
                'purchaseState' => 0,
                'quantity' => 1,
                'orderId' => 'GPA.topup-order',
            ]),
        ]);

        $verified = app(IapReceiptVerifier::class)->verify(
            'google',
            'app.vibyra.topup.500',
            'topup-token'
        );

        $this->assertSame('GPA.topup-order', $verified['originalTransactionId']);
        $this->assertSame('GPA.topup-order', $verified['transactionId']);
        $this->assertNull($verified['expiresAt']);
    }

    public function test_apple_does_not_fall_back_to_the_first_receipt_item(): void
    {
        config([
            'services.apple_iap.shared_secret' => 'secret',
            'services.apple_iap.verify_url' => 'https://apple.test/verify',
        ]);
        Http::fake([
            'https://apple.test/verify' => Http::response([
                'status' => 0,
                'latest_receipt_info' => [[
                    'product_id' => 'app.vibyra.topup.1500',
                    'transaction_id' => 'different-transaction',
                    'original_transaction_id' => 'different-original',
                ]],
            ]),
        ]);

        $this->expectExceptionMessage('Apple receipt did not contain the expected product.');
        app(IapReceiptVerifier::class)->verify(
            'apple',
            'app.vibyra.topup.500',
            'receipt'
        );
    }

    public function test_google_subscription_without_entitlement_is_rejected(): void
    {
        $this->configureGoogleIap();
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'play-access-token',
            ]),
            'https://play.test/*' => Http::response([
                'subscriptionState' => 'SUBSCRIPTION_STATE_ON_HOLD',
                'lineItems' => [[
                    'productId' => 'app.vibyra.membership.pro.monthly',
                    'expiryTime' => now()->addMonth()->toIso8601String(),
                ]],
            ]),
        ]);

        $this->expectExceptionMessage('Google Play subscription is not active');
        app(IapReceiptVerifier::class)->verify(
            'google',
            'app.vibyra.membership.pro.monthly',
            'held-token'
        );
    }

    private function configureGoogleIap(): void
    {
        Cache::flush();
        $key = openssl_pkey_new(['private_key_bits' => 1024]);
        openssl_pkey_export($key, $privateKey);
        config([
            'services.google_iap.package_name' => 'app.vibyra',
            'services.google_iap.api_url' => 'https://play.test',
            'services.google_iap.service_account_json' => json_encode([
                'client_email' => 'iap-verifier@vibyra.test',
                'private_key' => $privateKey,
                'token_uri' => 'https://oauth2.googleapis.com/token',
            ], JSON_THROW_ON_ERROR),
        ]);
    }
}
