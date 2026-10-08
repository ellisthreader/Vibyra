<?php

namespace App\Services\Auth;

use Illuminate\Http\Response;

/** Two independent proofs: the app keeps its flow secret; only the browser gets this code. */
final class ProviderAppReturn
{
    public static function requested(array $client, ?string $binding): bool
    {
        return $binding === null && ($client['appReturn'] ?? null) === 'vibyra-app-v1';
    }

    public static function enabled(array $flow): bool
    {
        return is_string($flow['appReturnCode'] ?? null)
            && preg_match('/\A[a-f0-9]{64}\z/', $flow['appReturnCode']) === 1;
    }

    public static function response(?array $flow): ?Response
    {
        if ($flow === null || ! self::enabled($flow)) {
            return null;
        }
        // Fixed destination, no bearer/challenge/identity in the URL. The app must
        // match the exact attempt, then claim over HTTPS with both private proofs.
        $url = 'vibyra://auth-complete?'.http_build_query([
            'flowId' => $flow['flowId'], 'returnCode' => $flow['appReturnCode'],
        ], '', '&', PHP_QUERY_RFC3986);
        return response('', 303)->header('Location', $url)
            ->header('Cache-Control', 'no-store')->header('Referrer-Policy', 'no-referrer');
    }

    public static function awaitingProof(array $completed, ?string $code): bool
    {
        $hash = $completed['appReturnHash'] ?? null;
        return is_string($hash) && (! is_string($code) || ! hash_equals($hash, hash('sha256', $code)));
    }
}
