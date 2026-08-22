<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\ContentModeration;
use App\Services\Referrals\ReferralService;
use App\Services\WebsiteAccountPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class WebsiteAuthController extends Controller
{
    public function __construct(
        private readonly ContentModeration $moderation,
        private readonly ReferralService $referrals,
        private readonly WebsiteAccountPayload $payload,
    ) {}

    public function signup(Request $request): JsonResponse
    {
        $email = $this->normalizedEmail($request->input('email'));
        $password = (string) $request->input('password', '');
        $name = trim((string) $request->input('name', ''));
        $referralCode = $this->referrals->normalizeCode(
            $request->input('referralCode', $request->input('ref', ''))
        );

        if (! $email || strlen($password) < 8) {
            return response()->json(['ok' => false, 'error' => 'Enter a valid email and a password with at least 8 characters.'], 422);
        }
        if (User::where('email', $email)->exists()) {
            return response()->json(['ok' => false, 'error' => 'An account already exists for that email. Log in instead.'], 409);
        }
        if ($referralCode && ! $this->referrals->referrerFor($referralCode)) {
            return response()->json(['ok' => false, 'error' => 'That invite code was not found. Check it and try again.'], 422);
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
            'credits_balance' => (int) config('billing.plans.free.monthly_credits', 50),
            'credits_used' => 0,
            'onboarding_complete' => false,
            'remembered_desktops' => [],
            'app_state' => [],
        ]);
        $this->referrals->registerSignup($user, $referralCode);
        $user = $user->fresh() ?? $user;

        try {
            $user->sendEmailVerificationNotification();
        } catch (\Throwable) {
            // Account creation remains available during a mail outage.
        }

        $this->establishSession($request, $user);

        return response()->json(['ok' => true, 'user' => $this->payload->for($user)], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $email = $this->normalizedEmail($request->input('email'));
        $user = $email ? User::where('email', $email)->first() : null;
        $password = (string) $request->input('password', '');

        if (! $user || ($user->provider ?: 'email') !== 'email'
            || ! Hash::check($password, $user->password)) {
            return response()->json(['ok' => false, 'error' => 'Email or password is incorrect.'], 401);
        }

        $this->establishSession($request, $user);

        return response()->json(['ok' => true, 'user' => $this->payload->for($user)]);
    }

    public function session(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['ok' => false, 'error' => 'Please log in.'], 401);
        }

        return response()->json(['ok' => true, 'user' => $this->payload->for($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    private function establishSession(Request $request, User $user): void
    {
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
    }

    private function normalizedEmail(mixed $value): ?string
    {
        $email = strtolower(trim((string) $value));

        return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    private function nameFromEmail(string $email): string
    {
        return str($email)->before('@')->replace(['.', '_', '-'], ' ')->title()->toString();
    }
}
