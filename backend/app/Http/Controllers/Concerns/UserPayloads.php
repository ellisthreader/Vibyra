<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\LevelProgression;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait UserPayloads
{
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
            'last_used_at' => now(),
        ]);

        return $token;
    }

    private function authenticatedUser(Request $request): User
    {
        $token = (string) $request->bearerToken();
        if ($token === '') {
            abort($this->json(['ok' => false, 'error' => 'Missing app session token.'], 401));
        }

        $session = VibyraSession::where('token_hash', hash('sha256', $token))->first();
        if (! $session) {
            abort($this->json(['ok' => false, 'error' => 'Your session expired. Please log in again.'], 401));
        }

        $session->forceFill(['last_used_at' => now()])->save();

        return $session->user;
    }

    private function userPayload(User $user): array
    {
        $plan = $user->plan ?: 'free';
        $cycle = $user->plan_billing_cycle ?: 'monthly';
        $planConfig = (array) config("billing.plans.{$plan}", []);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'plan' => $plan,
            'planBillingCycle' => $cycle,
            'planRenewsAt' => optional($user->plan_renews_at)->toIso8601String(),
            'creditsBalance' => (int) $user->credits_balance,
            'creditsUsed' => (int) $user->credits_used,
            'level' => app(LevelProgression::class)->payload($user),
            'dailyCreditsUsed' => (int) ($user->daily_credits_used ?? 0),
            'dailyCreditsCap' => (int) ($planConfig['daily_credit_cap'] ?? 0),
            'monthlyCredits' => (int) ($cycle === 'annual'
                ? ($planConfig['annual_credits'] ?? $planConfig['monthly_credits'] ?? 0)
                : ($planConfig['monthly_credits'] ?? 0)),
            'allowedModelTiers' => array_values((array) ($planConfig['allowed_tiers'] ?? ['free', 'budget'])),
            'onboardingComplete' => (bool) $user->onboarding_complete,
            'rememberedDesktops' => $this->normalizeRememberedDesktops($user->remembered_desktops),
            'appState' => is_array($user->app_state) ? $user->app_state : [],
        ];
    }

    private function normalizeRememberedDesktops(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_slice(array_filter($value, function (mixed $item): bool {
            return is_array($item) && ! empty($item['url']) && ! empty($item['pairCode']);
        }), 0, 8));
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
        return response()
            ->json($payload, $status)
            ->withHeaders([
                'Access-Control-Allow-Origin' => '*',
                'Access-Control-Allow-Headers' => 'Content-Type, Authorization',
                'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
            ]);
    }
}
