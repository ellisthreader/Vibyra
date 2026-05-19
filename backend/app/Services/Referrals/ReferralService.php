<?php

namespace App\Services\Referrals;

use App\Models\CreditLedger;
use App\Models\Referral;
use App\Models\User;
use App\Services\Billing\CreditDeductor;
use Illuminate\Support\Facades\DB;

class ReferralService
{
    private const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function __construct(private readonly CreditDeductor $credits)
    {
    }

    public function ensureCode(User $user): string
    {
        if ($user->referral_code) {
            return $user->referral_code;
        }

        do {
            $code = $this->randomCode();
        } while (User::where('referral_code', $code)->exists());

        $user->forceFill(['referral_code' => $code])->save();

        return $code;
    }

    public function referrerFor(?string $code): ?User
    {
        $normalized = $this->normalizeCode($code);
        if ($normalized === '') {
            return null;
        }

        return User::where('referral_code', $normalized)->first();
    }

    public function normalizeCode(?string $code): string
    {
        return strtoupper((string) preg_replace('/[^A-Za-z0-9]/', '', (string) $code));
    }

    public function registerSignup(User $newUser, ?string $code): ?Referral
    {
        $this->ensureCode($newUser);
        $referrer = $this->referrerFor($code);
        if (! $referrer || $referrer->id === $newUser->id) {
            return null;
        }

        $referral = Referral::firstOrCreate([
            'referred_user_id' => $newUser->id,
        ], [
            'referrer_user_id' => $referrer->id,
            'code' => $referrer->referral_code,
        ]);

        if ((int) $referral->referrer_user_id !== (int) $referrer->id) {
            return $referral;
        }

        $this->grantSignupRewards($referral->fresh() ?? $referral, $newUser, $referrer);

        return $referral->fresh();
    }

    public function recordPaidConversion(User $referredUser, string $plan, string $provider): void
    {
        DB::transaction(function () use ($referredUser, $plan, $provider) {
            $referral = Referral::where('referred_user_id', $referredUser->id)->lockForUpdate()->first();
            if (! $referral || $referral->paid_reward_granted_at) {
                return;
            }

            $referrer = User::find($referral->referrer_user_id);
            if (! $referrer) {
                return;
            }

            $rewards = $this->rewards();
            $this->grantIfMissing($referredUser, $rewards['referred_paid_credits'], 'referral_paid', "referral-paid-referred:{$referral->id}", [
                'referrerUserId' => $referrer->id,
                'plan' => $plan,
                'provider' => $provider,
            ]);
            $this->grantIfMissing($referrer, $rewards['referrer_paid_credits'], 'referral_paid', "referral-paid-referrer:{$referral->id}", [
                'referredUserId' => $referredUser->id,
                'plan' => $plan,
                'provider' => $provider,
            ]);

            $referral->forceFill([
                'paid_reward_granted_at' => now(),
                'paid_plan' => $plan,
                'paid_provider' => $provider,
            ])->save();
        });
    }

    public function summary(User $user): array
    {
        $code = $this->ensureCode($user);
        $baseUrl = rtrim((string) config('referrals.invite_base_url'), '/');
        $referrals = Referral::where('referrer_user_id', $user->id);

        return [
            'code' => $code,
            'link' => "{$baseUrl}/{$code}",
            'rewards' => $this->rewards(),
            'stats' => [
                'signedUp' => (clone $referrals)->count(),
                'paid' => (clone $referrals)->whereNotNull('paid_reward_granted_at')->count(),
                'earnedCredits' => CreditLedger::where('user_id', $user->id)
                    ->whereIn('kind', ['referral_signup', 'referral_paid'])
                    ->sum('credits_delta'),
            ],
        ];
    }

    private function grantSignupRewards(Referral $referral, User $newUser, User $referrer): void
    {
        if ($referral->signup_reward_granted_at) {
            return;
        }

        $rewards = $this->rewards();
        $this->grantIfMissing($newUser, $rewards['referred_signup_credits'], 'referral_signup', "referral-signup-referred:{$referral->id}", [
            'referrerUserId' => $referrer->id,
        ]);
        $this->grantIfMissing($referrer, $rewards['referrer_signup_credits'], 'referral_signup', "referral-signup-referrer:{$referral->id}", [
            'referredUserId' => $newUser->id,
        ]);

        $referral->forceFill(['signup_reward_granted_at' => now()])->save();
    }

    private function grantIfMissing(User $user, int $credits, string $kind, string $reference, array $meta): void
    {
        if ($credits <= 0 || CreditLedger::where('user_id', $user->id)->where('reference', $reference)->exists()) {
            return;
        }

        $this->credits->grant($user, $credits, $kind, $reference, $meta);
    }

    private function rewards(): array
    {
        return [
            'referred_signup_credits' => (int) config('referrals.rewards.referred_signup_credits', 25),
            'referrer_signup_credits' => (int) config('referrals.rewards.referrer_signup_credits', 50),
            'referred_paid_credits' => (int) config('referrals.rewards.referred_paid_credits', 100),
            'referrer_paid_credits' => (int) config('referrals.rewards.referrer_paid_credits', 150),
        ];
    }

    private function randomCode(): string
    {
        $code = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
        }

        return $code;
    }
}
