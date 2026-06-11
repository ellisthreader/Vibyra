<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\ProviderIdentityVerifier;
use App\Services\Auth\ProviderChallengeService;
use App\Services\Auth\ProviderAccountException;
use App\Services\Auth\ProviderAccountService;
use App\Services\LevelProgression;
use App\Services\Referrals\ReferralService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

trait AuthEndpoints
{
    public function providerChallenge(Request $request): JsonResponse
    {
        try {
            $challenge = app(ProviderChallengeService::class)->issue(
                strtolower(trim((string) $request->input('provider', '')))
            );
        } catch (ProviderIdentityException) {
            return $this->json(['ok' => false, 'error' => 'Unsupported challenge provider.'], 422);
        }

        return $this->json(['ok' => true, ...$challenge]);
    }

    public function signup(Request $request): JsonResponse
    {
        $email = $this->normalizeEmail($request->input('email'));
        $password = (string) $request->input('password', '');
        $name = trim((string) $request->input('name', ''));
        $referralCode = $this->referralCodeFromRequest($request);

        if (! $email || strlen($password) < 8) {
            return $this->json(['ok' => false, 'error' => 'Enter a valid email and a password with at least 8 characters.'], 422);
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

        try {
            $user->sendEmailVerificationNotification();
        } catch (\Throwable) {
            // Account creation should remain usable when the mail provider is temporarily unavailable.
        }

        return $this->json([
            ...$this->sessionPayload($request, $user),
            'isNewUser' => true,
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $provider = strtolower((string) $request->input('provider', 'email'));

        if ($provider === 'email') {
            return $this->emailLogin($request);
        }

        if (! in_array($provider, ['apple', 'google'], true)) {
            return $this->json(['ok' => false, 'error' => 'Unsupported login provider.'], 422);
        }

        try {
            $nonce = $provider === 'apple'
                ? app(ProviderChallengeService::class)->consume(
                    $provider,
                    trim((string) $request->input('challengeId', ''))
                )
                : null;
            $identity = app(ProviderIdentityVerifier::class)->verify(
                $provider,
                trim((string) $request->input('identityToken', '')),
                $nonce,
            );
        } catch (ProviderIdentityException) {
            return $this->json(['ok' => false, 'error' => 'The provider could not verify this sign-in. Try again.'], 401);
        }

        try {
            $account = app(ProviderAccountService::class)->resolveWithStatus($request, $provider, $identity);
        } catch (ProviderAccountException $error) {
            return $this->json(['ok' => false, 'error' => $error->getMessage()], $error->status);
        }

        return $this->json([
            ...$this->sessionPayload($request, $account['user']),
            'isNewUser' => $account['created'],
        ]);
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

        if (! $user || ($user->provider ?: 'email') !== 'email' || ! Hash::check($password, $user->password)) {
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
