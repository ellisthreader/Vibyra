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
        $existing = User::where('email', $email)->first();
        if ($existing) {
            if (! $this->canSignInByEmail($existing, $provider, $identity)) {
                throw new ProviderAccountException(
                    'An account already exists for that email. Log in with its original method.',
                    409
                );
            }

            return ['user' => $existing, 'created' => false];
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
            'email_verified_at' => ($identity['emailVerified'] ?? true) ? now() : null,
        ]);
        $this->referrals->registerSignup($user, $referralCode);

        if ($provider === 'microsoft') {
            try {
                $user->sendEmailVerificationNotification();
            } catch (\Throwable) {
                // A mail transport outage must not invalidate the provider session.
            }
        }

        return ['user' => $user->fresh() ?? $user, 'created' => true];
    }

    /**
     * Only provider-authoritative, verified email can select an existing account.
     * Google verification alone can be stale for external, non-Workspace mailboxes.
     * The account's own address must be verified too: otherwise someone could
     * register a victim's email first and wait for them to arrive by Google.
     * An account protected by two-factor keeps its password-and-code sign-in.
     */
    private function canSignInByEmail(User $user, string $provider, array $identity): bool
    {
        return in_array($provider, ['google', 'apple'], true)
            && ($identity['emailVerified'] ?? false) === true
            && ($identity['authoritativeEmail'] ?? false) === true
            && $user->email_verified_at !== null
            && ! app(TwoFactor::class)->enabled($user);
    }
}
