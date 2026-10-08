<?php

namespace App\Services\ChatConnectors\Stripe;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * How a Stripe call proves who it is. A pasted restricted key (and the access token older Connect platforms were
 * handed) is itself the bearer. Connect OAuth no longer returns a usable one - its `access_token` is deprecated and
 * absent from new responses - only the connected account's id, so a sign-in is stored as that id, signed with the app
 * key, and every call is made with the platform's secret key plus a `Stripe-Account` header. The signature is what
 * stops a pasted "acct_..." (the connect endpoint accepts any string) from reaching an account nobody signed in to.
 */
final class Auth
{
    private const PREFIX = 'vbacct.';

    public static function valid(mixed $account): bool
    {
        return is_string($account) && preg_match('/^acct_[A-Za-z0-9]{1,64}$/D', $account) === 1;
    }

    public static function wrap(string $account): string
    {
        return self::PREFIX.$account.'.'.self::signature($account);
    }

    /** The account this credential was signed in for; null for any other credential, forged markers included. */
    public static function account(string $credential): ?string
    {
        if (!str_starts_with($credential, self::PREFIX)) return null;
        [$account, $signature] = array_pad(explode('.', substr($credential, strlen(self::PREFIX)), 2), 2, '');
        return self::valid($account) && hash_equals(self::signature($account), $signature) ? $account : null;
    }

    public static function apply(PendingRequest $request, string $credential): PendingRequest
    {
        $account = self::account($credential);
        return $account === null ? $request->withToken($credential)
            : $request->withToken(self::platformKey())->withHeaders(['Stripe-Account' => $account]);
    }

    public static function testMode(string $credential): bool
    {
        $key = self::account($credential) === null ? $credential : self::platformKey();
        return str_starts_with($key, 'sk_test_') || str_starts_with($key, 'rk_test_');
    }

    /** Tells Stripe this platform no longer acts for the account. Best effort: true only when Stripe confirmed it. */
    public static function deauthorize(string $credential): bool
    {
        $account = self::account($credential);
        $client = (string) config('chat_connectors.catalogue.stripe.oauth.client_id');
        if ($account === null || $client === '') return false;
        try {
            return Http::withBasicAuth(self::platformKey(), '')->asForm()->acceptJson()->timeout(10)
                ->post('https://connect.stripe.com/oauth/deauthorize', ['client_id' => $client, 'stripe_user_id' => $account])
                ->successful();
        } catch (\Throwable) { return false; }
    }

    private static function platformKey(): string
    {
        return (string) config('chat_connectors.catalogue.stripe.oauth.client_secret');
    }

    private static function signature(string $account): string
    {
        return hash_hmac('sha256', 'stripe-account:'.$account, (string) config('app.key'));
    }
}
