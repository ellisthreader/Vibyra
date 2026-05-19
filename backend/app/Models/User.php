<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable([
    'name',
    'email',
    'provider',
    'provider_id',
    'password',
    'plan',
    'plan_billing_cycle',
    'plan_renews_at',
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
    'stripe_customer_id',
    'stripe_subscription_id',
    'billing_provider',
    'referral_code',
    'onboarding_complete',
    'remembered_desktops',
    'app_state',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
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
            'plan_renews_at' => 'datetime',
            'onboarding_complete' => 'boolean',
            'remembered_desktops' => 'array',
            'app_state' => 'array',
        ];
    }
}
