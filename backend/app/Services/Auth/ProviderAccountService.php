<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\ContentModeration;
use App\Services\Referrals\ReferralService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ProviderAccountService
{
    public function __construct(
        private readonly ContentModeration $moderation,
        private readonly ReferralService $referrals,
    ) {
    }

    public function resolve(Request $request, string $provider, array $identity): User
    {
        return $this->resolveWithStatus($request, $provider, $identity)['user'];
    }

    public function resolveWithStatus(Request $request, string $provider, array $identity): array
    {
        $providerId = (string) $identity['subject'];
        $user = User::where('provider', $provider)->where('provider_id', $providerId)->first();
        if ($user) {
            return ['user' => $user, 'created' => false];
        }

        $referralCode = $this->referrals->normalizeCode(
            $request->input('referralCode', $request->input('ref', ''))
        );
        if ($referralCode && ! $this->referrals->referrerFor($referralCode)) {
            throw new ProviderAccountException('That invite code was not found. Check it and try again.', 422);
        }

        $email = $identity['email'];
        if (! $email) {
            throw new ProviderAccountException(
                'The provider did not return a verified email address for this new account.',
                422
            );
        }
        if (User::where('email', $email)->exists()) {
            throw new ProviderAccountException(
                'An account already exists for that email. Log in with its original method.',
                409
            );
        }

        $name = trim((string) $request->input('name', ''))
            ?: $identity['name']
            ?: ucfirst($provider).' User';
        $this->moderation->assertLocalTextAllowed($name, 'auth.name');

        $user = User::create([
            'name' => $name,
            'email' => $email,
            'provider' => $provider,
            'provider_id' => $providerId,
            'password' => Str::random(48),
            'plan' => 'free',
            'plan_billing_cycle' => 'monthly',
            'plan_renews_at' => now()->addMonth(),
            'credits_balance' => (int) (config('billing.plans.free.monthly_credits') ?? 50),
            'credits_used' => 0,
            'onboarding_complete' => false,
            'remembered_desktops' => [],
            'app_state' => [],
            'email_verified_at' => now(),
        ]);
        $this->referrals->registerSignup($user, $referralCode);

        return ['user' => $user->fresh() ?? $user, 'created' => true];
    }
}
