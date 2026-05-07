<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

trait UserPayloads
{
    private function sessionPayload(Request $request, User $user): array
    {
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
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'plan' => $user->plan ?: 'free',
            'creditsBalance' => (int) $user->credits_balance,
            'creditsUsed' => (int) $user->credits_used,
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
