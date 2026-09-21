<?php
namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Account\AvatarStore;
use App\Services\LevelProgression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
trait UserPayloads
{
    use SessionRequestIp;
    use SessionResolution;

    private function sessionPayload(Request $request, User $user): array
    {
        if (method_exists($this, 'recordDailyLogin')) {
            $this->recordDailyLogin($user);
            $user = $user->fresh() ?? $user;
        }
        return [
            'ok' => true,
            'token' => $this->createSession($request, $user),
            'user' => $this->userPayload($user),
        ];
    }
    private function createSession(Request $request, User $user): string
    {
        $token = Str::random(72);
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'device_name' => (string) $request->input('deviceName', 'Vibyra App'),
            'device_identifier' => $this->sessionDeviceIdentifier($request),
            'ip_address' => $this->sessionRequestIp($request),
            'user_agent' => (string) $request->userAgent(),
            'last_used_at' => now(),
            'idle_expires_at' => now()->addMinutes(max(1, (int) config('session_security.idle_minutes', 20160))),
            'absolute_expires_at' => now()->addMinutes(max(1, (int) config('session_security.absolute_minutes', 129600))),
        ]);

        return $token;
    }
    private function sessionDeviceIdentifier(Request $request): ?string
    {
        $value = trim((string) $request->input('installId', ''));

        return $value === '' ? null : mb_substr($value, 0, 128);
    }
    /**
     * The account behind the session token, refusing a guest unless the caller
     * says it can handle one.
     *
     * Guests are ordinary `users` rows, so a guest session would otherwise reach
     * every authenticated endpoint in the app. The default is the safe one and
     * `$allowGuest` is opted into by name, which means a new endpoint is closed to
     * guests unless somebody decided otherwise on purpose.
     */
    private function authenticatedUser(Request $request, bool $allowGuest = false): User
    {
        return $this->refuseGuest($this->authenticatedSession($request)->user, $allowGuest);
    }
    private function refuseGuest(User $user, bool $allowGuest): User
    {
        if ($user->isGuest() && ! $allowGuest) {
            abort($this->json(['ok' => false, 'error' => 'Create your free account to use this.'], 403));
        }

        return $user;
    }
    private function userPayload(User $user): array
    {
        $plan = $user->plan ?: 'free';
        $cycle = $user->plan_billing_cycle ?: 'monthly';
        $planConfig = (array) config("billing.plans.{$plan}", []);
        $billingProvider = (string) ($user->billing_provider ?? '');
        $priceKey = $cycle === 'annual' ? 'annual_price_pence' : 'monthly_price_pence';

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'avatarUrl' => app(AvatarStore::class)->url($user),
            'createdAt' => optional($user->created_at)->toIso8601String(),
            'provider' => $user->provider ?: 'email',
            'emailVerified' => $user->hasVerifiedEmail(),
            'twoFactorEnabled' => app(\App\Services\Auth\TwoFactor::class)->enabled($user),
            'phoneNumber' => $user->phone_number,
            'phoneVerified' => $user->phone_verified_at !== null,
            'pendingPhoneNumber' => $user->pending_phone_number,
            'plan' => $plan,
            'planBillingCycle' => $cycle,
            'planRenewsAt' => optional($user->plan_renews_at)->toIso8601String(),
            'creditsResetAt' => optional($user->plan_renews_at)->toIso8601String(),
            'membershipEndsAt' => optional($user->membership_ends_at)->toIso8601String(),
            'membershipCancelAtPeriodEnd' => (bool) $user->membership_cancel_at_period_end,
            'billingProvider' => $billingProvider ?: null,
            'canManageStripeBilling' => $billingProvider === 'stripe' && (string) ($user->stripe_customer_id ?? '') !== '',
            'planPricePence' => (int) ($planConfig[$priceKey] ?? 0),
            'billingCurrency' => 'gbp',
            'billingVatInclusive' => true,
            'creditsBalance' => (int) $user->credits_balance,
            'creditsUsed' => (int) $user->credits_used,
            'level' => app(LevelProgression::class)->payload($user),
            'dailyCreditsUsed' => (int) ($user->daily_credits_used ?? 0),
            'dailyCreditsCap' => (int) ($planConfig['daily_credit_cap'] ?? 0),
            'dailyCreditsResetAt' => optional($user->daily_credits_reset_at)->toIso8601String(),
            'burstCreditsUsed' => (int) ($user->burst_credits_used ?? 0),
            'burstCreditsCap' => (int) ($planConfig['burst_credit_cap'] ?? 0),
            'burstCreditsResetAt' => optional($user->burst_credits_reset_at)->toIso8601String(),
            'burstWindowHours' => 5,
            'weeklyCreditsUsed' => (int) ($user->weekly_credits_used ?? 0),
            'weeklyCreditsCap' => (int) ($planConfig['weekly_credit_cap'] ?? 0),
            'weeklyCreditsResetAt' => optional($user->weekly_credits_reset_at)->toIso8601String(),
            'monthlyCredits' => (int) ($cycle === 'annual'
                ? ($planConfig['annual_credits'] ?? $planConfig['monthly_credits'] ?? 0)
                : ($planConfig['monthly_credits'] ?? 0)),
            'maxConcurrentAgents' => (int) ($planConfig['max_concurrent_agents'] ?? 0),
            'maxActiveProjects' => (int) ($planConfig['max_active_projects'] ?? 0),
            'contextTokenCap' => (int) ($planConfig['context_token_cap'] ?? 0),
            'allowedModelTiers' => array_values((array) ($planConfig['allowed_tiers'] ?? ['free', 'budget'])),
            'onboardingComplete' => (bool) $user->onboarding_complete,
            'rememberedDesktops' => $this->normalizeRememberedDesktops($user->remembered_desktops),
            'appState' => is_array($user->app_state) ? $user->app_state : [],
            ...(app(\App\Services\Vibes\AccountMembership::class)->for($user) ?? []),
        ];
    }

    private function normalizeRememberedDesktops(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $allowed = array_flip([
            'url',
            'pairCode',
            'machineName',
            'connectionUrls',
            'status',
            'lastSeenAt',
            'lastConnectedAt',
        ]);
        $desktops = array_filter($value, function (mixed $item): bool {
            return is_array($item) && ! empty($item['url']) && ! empty($item['pairCode']);
        });

        return array_values(array_map(
            fn (array $desktop): array => array_intersect_key($desktop, $allowed),
            array_slice($desktops, 0, 8)
        ));
    }

    private function normalizeEmail(mixed $value): ?string
    {
        $email = strtolower(trim((string) $value));

        return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    private function nameFromEmail(string $email): string
    {
        return Str::of($email)->before('@')->replace(['.', '_', '-'], ' ')->title()->toString();
    }

    private function json(array $payload, int $status = 200): JsonResponse
    {
        return response()->json($payload, $status);
    }
}
