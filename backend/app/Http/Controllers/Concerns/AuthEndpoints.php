<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\LevelProgression;
use App\Services\Referrals\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

trait AuthEndpoints
{
    public function signup(Request $request): JsonResponse
    {
        $email = $this->normalizeEmail($request->input('email'));
        $password = (string) $request->input('password', '');
        $name = trim((string) $request->input('name', ''));
        $referralCode = $this->referralCodeFromRequest($request);

        if (! $email || strlen($password) < 6) {
            return $this->json(['ok' => false, 'error' => 'Enter a valid email and a password with at least 6 characters.'], 422);
        }

        if (User::where('email', $email)->exists()) {
            return $this->json(['ok' => false, 'error' => 'An account already exists for that email. Log in instead.'], 409);
        }

        if ($referralCode && ! app(ReferralService::class)->referrerFor($referralCode)) {
            return $this->json(['ok' => false, 'error' => 'That invite code was not found. Check it and try again.'], 422);
        }

        $this->moderation->assertLocalTextAllowed($name, 'auth.name');

        $user = User::create([
            'name' => $name !== '' ? $name : $this->nameFromEmail($email),
            'email' => $email,
            'provider' => 'email',
            'provider_id' => $email,
            'password' => $password,
            'plan' => 'free',
            'plan_billing_cycle' => 'monthly',
            'plan_renews_at' => now()->addMonth(),
            'credits_balance' => (int) (config('billing.plans.free.monthly_credits') ?? 50),
            'credits_used' => 0,
            'onboarding_complete' => false,
            'remembered_desktops' => [],
            'app_state' => [],
        ]);
        app(ReferralService::class)->registerSignup($user, $referralCode);
        $user = $user->fresh() ?? $user;

        return $this->json($this->sessionPayload($request, $user), 201);
    }

    public function login(Request $request): JsonResponse
    {
        $provider = strtolower((string) $request->input('provider', 'email'));

        if ($provider === 'email') {
            return $this->emailLogin($request);
        }

        if (! in_array($provider, ['apple', 'google', 'microsoft'], true)) {
            return $this->json(['ok' => false, 'error' => 'Unsupported login provider.'], 422);
        }

        $providerId = trim((string) $request->input('providerId', $request->input('installId', '')));
        if ($providerId === '') {
            $providerId = (string) Str::uuid();
        }

        $user = User::where('provider', $provider)->where('provider_id', $providerId)->first();
        if (! $user) {
            $referralCode = $this->referralCodeFromRequest($request);
            if ($referralCode && ! app(ReferralService::class)->referrerFor($referralCode)) {
                return $this->json(['ok' => false, 'error' => 'That invite code was not found. Check it and try again.'], 422);
            }

            $fallbackEmail = sprintf('%s.%s@vibyra.local', $provider, substr(hash('sha256', $providerId), 0, 12));
            $email = $this->normalizeEmail($request->input('email')) ?: $fallbackEmail;
            $name = trim((string) $request->input('name', '')) ?: ucfirst($provider).' User';
            if (User::where('email', $email)->exists()) {
                $email = $fallbackEmail;
            }

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
            ]);
            app(ReferralService::class)->registerSignup($user, $referralCode);
            $user = $user->fresh() ?? $user;
        }

        return $this->json($this->sessionPayload($request, $user));
    }

    public function session(Request $request): JsonResponse
    {
        return $this->json([
            'ok' => true,
            'user' => $this->userPayload($this->authenticatedUser($request)),
        ]);
    }

    public function saveState(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        if ($request->has('onboardingComplete')) {
            $user->onboarding_complete = (bool) $request->input('onboardingComplete');
        }

        if ($request->has('rememberedDesktops')) {
            $user->remembered_desktops = $this->normalizeRememberedDesktops($request->input('rememberedDesktops'));
        }

        if ($request->has('appState') && is_array($request->input('appState'))) {
            $incoming = $request->input('appState');
            $existing = is_array($user->app_state) ? $user->app_state : [];
            $incomingMemories = is_array($incoming['projectMemories'] ?? null) ? $incoming['projectMemories'] : [];
            $existingMemories = is_array($existing['projectMemories'] ?? null) ? $existing['projectMemories'] : [];
            $merged = array_replace($existing, $incoming);
            $merged['projectMemories'] = $this->mergeProjectMemoriesState($incomingMemories, $existingMemories);
            $user->app_state = $merged;
        }

        $user->save();

        return $this->json([
            'ok' => true,
            'user' => $this->userPayload($user),
        ]);
    }

    public function completeOnboarding(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $user->forceFill(['onboarding_complete' => true])->save();

        return $this->json([
            'ok' => true,
            'user' => $this->userPayload($user),
        ]);
    }

    private function emailLogin(Request $request): JsonResponse
    {
        $email = $this->normalizeEmail($request->input('email'));
        $password = (string) $request->input('password', '');
        $user = $email ? User::where('email', $email)->first() : null;

        if (! $user || ! Hash::check($password, $user->password)) {
            return $this->json(['ok' => false, 'error' => 'Email or password is incorrect.'], 401);
        }

        return $this->json($this->sessionPayload($request, $user));
    }

    private function recordDailyLogin(User $user): void
    {
        app(LevelProgression::class)->record($user, 'daily_login', 'daily-login:' . now()->toDateString());
    }

    private function referralCodeFromRequest(Request $request): string
    {
        return app(ReferralService::class)->normalizeCode(
            $request->input('referralCode', $request->input('ref', ''))
        );
    }
}
