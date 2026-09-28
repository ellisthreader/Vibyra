<?php

namespace App\Models;

use App\Notifications\VibyraResetPassword;
use App\Notifications\VibyraVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable([
    'name',
    'email',
    'email_verified_at',
    'phone_number',
    'phone_verified_at',
    'pending_phone_number',
    'provider',
    'provider_id',
    'guest_at',
    'password',
    'plan',
    'plan_billing_cycle',
    'plan_renews_at',
    'membership_ends_at',
    'membership_cancel_at_period_end',
    'credits_balance',
    'credits_used',
    'level_xp_total',
    'level',
    'level_rewarded_level',
    'daily_credits_used',
    'daily_credits_reset_at',
    'burst_credits_used',
    'burst_credits_reset_at',
    'weekly_credits_used',
    'weekly_credits_reset_at',
    'openrouter_reserved_micro_usd',
    'openrouter_spent_micro_usd',
    'openrouter_spend_period',
    'stripe_customer_id',
    'stripe_subscription_id',
    'billing_provider',
    'referral_code',
    'onboarding_complete',
    'remembered_desktops',
    'app_state',
])]
#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes', 'two_factor_last_slot'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * An account that has not been signed up yet: it can hold and spend Vibes and
     * nothing else. Every authenticated endpoint refuses one unless it opts in.
     */
    public function isGuest(): bool
    {
        return $this->guest_at !== null;
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'guest_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'password' => 'hashed',
            'credits_balance' => 'integer',
            'credits_used' => 'integer',
            'level_xp_total' => 'integer',
            'level' => 'integer',
            'level_rewarded_level' => 'integer',
            'daily_credits_used' => 'integer',
            'daily_credits_reset_at' => 'datetime',
            'burst_credits_used' => 'integer',
            'burst_credits_reset_at' => 'datetime',
            'weekly_credits_used' => 'integer',
            'weekly_credits_reset_at' => 'datetime',
            'openrouter_reserved_micro_usd' => 'integer',
            'openrouter_spent_micro_usd' => 'integer',
            'plan_renews_at' => 'datetime',
            'membership_ends_at' => 'datetime',
            'membership_cancel_at_period_end' => 'boolean',
            'onboarding_complete' => 'boolean',
            'remembered_desktops' => 'array',
            'app_state' => 'array',
        ];
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VibyraVerifyEmail);
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new VibyraResetPassword($token));
    }

    /**
     * Microsoft does not prove mailbox ownership, so an unverified Microsoft
     * account must not keep someone else's address from them. The account
     * stays usable through its Microsoft sign-in; only the address is released.
     */
    public static function releaseUnverifiedClaim(string $email): void
    {
        static::query()
            ->where('email', $email)
            ->whereNull('email_verified_at')
            ->where('provider', 'microsoft')
            ->get()
            ->each(fn (self $user) => $user->forceFill(['email' => 'unverified+'.$user->getKey().'@users.invalid'])->save());
    }

    /**
     * Signup has to say when an address is taken (it logs straight in), so
     * checking many addresses from one network is capped instead.
     */
    public static function emailTakenLimitReached(string $ip): bool
    {
        $key = 'signup-email-taken:'.hash('sha256', $ip);
        if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 5)) {
            return true;
        }
        \Illuminate\Support\Facades\RateLimiter::hit($key, 3600);

        return false;
    }
}
