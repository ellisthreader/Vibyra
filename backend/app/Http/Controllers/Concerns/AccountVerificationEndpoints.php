<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Auth\PhoneVerificationService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

trait AccountVerificationEndpoints
{
    public function startPhoneVerification(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $phoneNumber = $this->normalizePhoneNumber($request->input('phoneNumber'));
        if (! $phoneNumber) {
            return $this->json(['ok' => false, 'error' => 'Enter a phone number in international format, such as +447700900123.'], 422);
        }
        if (User::where('phone_number', $phoneNumber)->where('id', '!=', $user->id)->exists()) {
            return $this->json(['ok' => false, 'error' => 'That phone number is already linked to another account.'], 409);
        }

        if ($blocked = $this->phoneSendBlocked($phoneNumber, (int) $user->getKey())) {
            return $blocked;
        }

        try {
            app(PhoneVerificationService::class)->start($phoneNumber);
        } catch (RuntimeException) {
            return $this->json(['ok' => false, 'error' => 'Vibyra could not send a verification code. Try again later.'], 503);
        }

        $user->forceFill(['pending_phone_number' => $phoneNumber])->save();

        return $this->json([
            'ok' => true,
            'message' => 'A verification code was sent by SMS.',
            'pendingPhoneNumber' => $phoneNumber,
        ]);
    }

    public function checkPhoneVerification(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $phoneNumber = $this->normalizePhoneNumber($user->pending_phone_number);
        $code = preg_replace('/\D+/', '', (string) $request->input('code', ''));
        if (! $phoneNumber || ! preg_match('/^\d{4,10}$/', $code)) {
            return $this->json(['ok' => false, 'error' => 'Enter the verification code sent to your phone.'], 422);
        }

        try {
            $approved = app(PhoneVerificationService::class)->check($phoneNumber, $code);
        } catch (RuntimeException) {
            return $this->json(['ok' => false, 'error' => 'Vibyra could not verify that code. Try again later.'], 503);
        }
        if (! $approved) {
            return $this->json(['ok' => false, 'error' => 'That code is invalid or expired. Request a new code and try again.'], 422);
        }

        try {
            $user->forceFill([
                'phone_number' => $phoneNumber,
                'phone_verified_at' => now(),
                'pending_phone_number' => null,
            ])->save();
        } catch (QueryException) {
            return $this->json(['ok' => false, 'error' => 'That phone number is already linked to another account.'], 409);
        }

        return $this->json([
            'ok' => true,
            'message' => 'Phone number verified.',
            'user' => $this->userPayload($user->fresh() ?? $user),
        ]);
    }

    private function normalizePhoneNumber(mixed $value): ?string
    {
        $phoneNumber = preg_replace('/[\s().-]+/', '', trim((string) $value));

        return preg_match('/^\+[1-9]\d{7,14}$/', $phoneNumber) ? $phoneNumber : null;
    }

    /**
     * SMS pumping sends codes to premium numbers for the sender's profit, so
     * texts are capped per number, per account and for the whole service per
     * day, and can be limited to chosen country codes.
     */
    private function phoneSendBlocked(string $phoneNumber, int $userId): ?JsonResponse
    {
        $prefixes = (array) config('services.twilio_verify.allowed_prefixes', []);
        if ($prefixes !== [] && ! collect($prefixes)->contains(fn ($prefix) => str_starts_with($phoneNumber, (string) $prefix))) {
            return $this->json(['ok' => false, 'error' => 'Phone verification is not available for that country yet.'], 422);
        }

        $limits = [
            'sms:number:'.hash('sha256', $phoneNumber) => 3,
            'sms:user:'.$userId => 5,
            'sms:global' => (int) config('services.twilio_verify.daily_global_limit', 300),
        ];
        foreach ($limits as $key => $max) {
            if (\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, $max)) {
                return $this->json(['ok' => false, 'error' => 'Too many verification codes today. Try again tomorrow.'], 429);
            }
        }
        foreach (array_keys($limits) as $key) {
            \Illuminate\Support\Facades\RateLimiter::hit($key, 86400);
        }

        return null;
    }
}
