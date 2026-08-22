<?php

namespace Tests\Feature\Concerns\NextTen;

use App\Models\IapReceipt;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Billing\CreditDeductor;
use App\Services\Billing\IapPurchaseClaimer;
use App\Services\Billing\IapReceiptVerifier;
use Illuminate\Database\QueryException;
use RuntimeException;

trait BillingIapReceiptTestSupport
{
    private function authenticatedUser(string $email): array
        {
            $user = User::factory()->create([
                'name' => 'IAP Test User',
                'email' => $email,
                'credits_balance' => (int) config('billing.plans.free.monthly_credits'),
            ]);
            $token = 'iap-test-token-'.sha1($email);
            VibyraSession::create([
                'user_id' => $user->id,
                'token_hash' => hash('sha256', $token),
                'last_used_at' => now(),
            ]);

            return [$token, $user];
        }
}
