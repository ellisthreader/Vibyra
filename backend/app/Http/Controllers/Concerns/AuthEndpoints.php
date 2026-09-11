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
use App\Services\Vibes\Guests;
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

        /*
         * A session on a signup means one of two things. A guest is signing up,
         * which is what guests are for and is handled below by converting the row.
         * Anything else is a replay -- most often that same guest token after it
         * has already become an account, which a phone will send again after a
         * restore -- and answering it with a second account is exactly wrong, so
         * it is refused before anything is created.
         */
        $session = $this->optionalAuthenticatedUser($request, allowGuest: true);
        if ($session && ! $session->isGuest()) {
            return $this->json(['ok' => false, 'error' => 'You are already signed in. Log out to create another account.'], 403);
        }

        if (User::where('email', $email)->exists()) {
            return $this->json(['ok' => false, 'error' => 'An account already exists for that email. Log in instead.'], 409);
        }

        if ($referralCode && ! app(ReferralService::class)->referrerFor($referralCode)) {
            return $this->json(['ok' => false, 'error' => 'That invite code was not found. Check it and try again.'], 422);
        }

        $this->moderation->assertLocalTextAllowed($name, 'auth.name');

        /*
         * Signing up while already using Vibes as a guest turns that guest into
         * this account instead of making a second one. Nothing is transferred:
         * the wallet, its grants, its ledger and its chats are already keyed to
         * this row, so whatever is left of the trial is simply still there, and
         * spending it all first genuinely leaves nothing.
         *
         * The guest is taken from the session token on the request, so it cannot
         * be named by a caller who does not already hold it. `Guests::claim` locks
         * the row and rechecks both that it is still an unclaimed guest and that
         * the address is still free, so two signups racing on one guest cannot
         * both win.
         */
        $guest = $session;
        if ($guest) {
            $user = app(Guests::class)->claim($guest, $email, $password, $name);
            app(ReferralService::class)->registerSignup($user, $referralCode);
            $user = $user->fresh() ?? $user;
            try {
                $user->sendEmailVerificationNotification();
            } catch (\Throwable) {
                // Account creation stays usable when the mail provider is down.
            }

            return $this->json([...$this->sessionPayload($request, $user), 'isNewUser' => true], 201);
        }

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
