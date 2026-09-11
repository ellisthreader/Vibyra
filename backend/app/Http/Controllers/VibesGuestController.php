<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Vibes\{Guests, Wallet};
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Starting to use Vibes with no account at all.
 *
 * The response is an ordinary session token, because a guest is an ordinary
 * account row; what makes it a guest is `guest_at`, and every endpoint outside
 * Vibes refuses one. How many Vibes it starts with is Apple's answer, not the
 * caller's: nothing in the request can ask for a balance.
 */
class VibesGuestController extends Controller
{
    use UserPayloads;

    public function __invoke(Request $request, Guests $guests, Wallet $wallet): JsonResponse
    {
        abort_unless(config('vibes.guests_enabled'), 503, 'Guest Vibes are not available yet.');
        $data = $request->validate([
            // Apple's DeviceCheck token, base64 from `DCDevice.generateToken`. It is
            // used once, against Apple, and never stored.
            'deviceToken' => 'nullable|string|max:4000',
            'installId' => 'nullable|string|max:128',
        ]);

        // A second guard on top of the route throttle: one address should not be
        // able to mint guests even at one an hour, forever.
        $key = 'vibes-guest:'.hash('sha256', (string) $request->ip());
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return $this->json(['ok' => false, 'error' => 'Too many guest sessions from this network. Try again later.'], 429);
        }
        RateLimiter::hit($key, 3600);

        $user = $guests->issue($data['deviceToken'] ?? null, (string) ($data['installId'] ?? ''));
        return $this->json([
            'ok' => true,
            'token' => $this->createSession($request, $user),
            'user' => $this->userPayload($user),
            'wallet' => $wallet->payload($user->id),
        ]);
    }
}
