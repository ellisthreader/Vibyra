<?php

namespace App\Services\ChatConnectors;

use App\Services\ChatConnectors\Stripe\Auth as StripeAuth;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/** The token-endpoint half of `ConnectorOAuth`: how to ask, and how to read the answer. */
final class ConnectorTokens
{
    /** Google normally issues one-hour tokens. Other providers retain their established early-renewal policy. */
    public static function renewalMarginMinutes(string $slug): int
    {
        return in_array($slug, ['gmail', 'google_calendar'], true) ? 5 : 60;
    }

    /**
     * Figma's token endpoint identifies the app over Basic auth rather than as body
     * fields; a provider says so in its own catalogue block rather than this class
     * guessing from the slug.
     */
    public static function request(array $settings): PendingRequest
    {
        $request = Http::asForm()->acceptJson()->timeout(15)->withOptions(['allow_redirects' => false]);
        if (($settings['token_auth'] ?? null) === 'basic') {
            $request = $request->withBasicAuth((string) $settings['client_id'], (string) $settings['client_secret']);
        }
        return ($settings['token_encoding'] ?? null) === 'json' ? $request->asJson() : $request;
    }

    /**
     * The access token, its refresh token and lifetime, and the scopes the provider
     * actually granted, read under `$root` (Slack's user token lives under `authed_user.`).
     */
    public static function grant(Response $response, string $root, ?string $fallbackRefresh, array $settings = []): array
    {
        $scope = $response->json($root.'scope');
        $refresh = $response->json($root.'refresh_token');
        $refresh = is_string($refresh) && $refresh !== '' ? $refresh : $fallbackRefresh;
        $life = is_numeric($response->json($root.'expires_in')) ? (int) $response->json($root.'expires_in') : null;
        // Notion issues refresh tokens but never says when the access token ends, so without a lifetime to assume the
        // refresh token would sit unused until a call failed. Renewing early costs one request; never renewing costs the connection.
        if ($life === null && $refresh !== null && is_int($settings['assumed_lifetime'] ?? null)) $life = $settings['assumed_lifetime'];
        return ['access' => (string) $response->json($root.'access_token'), 'refresh' => $refresh, 'expires_in' => $life,
            'scope' => is_string($scope) && $scope !== '' ? mb_substr($scope, 0, 2000) : null];
    }

    /**
     * What a token response signs the person in with, or null when it holds nothing to sign in with. Stripe Connect
     * returns only the connected account's id (its `access_token` is deprecated), kept as a signed marker (Stripe\Auth).
     */
    public static function exchanged(array $settings, Response $response, string $root): ?array
    {
        $grant = self::grant($response, $root, null, $settings);
        if (($settings['credential_from'] ?? null) === 'stripe_account') {
            $account = $response->json('stripe_user_id');
            // No account id means a response from before the change: its access token, if any, still works as the bearer.
            if (StripeAuth::valid($account)) return [...$grant, 'access' => StripeAuth::wrap($account), 'refresh' => null, 'expires_in' => null];
        }
        return $grant['access'] === '' ? null : $grant;
    }

    /**
     * Whether a refused refresh means this person has to sign in again. A refusal of Vibyra's own client credentials
     * (an expired or wrong app secret) says nothing about their sign-in, so it must not tell everyone to reconnect.
     * Slack refuses with HTTP 200 and `ok: false`, so the error code counts as well as the status.
     */
    public static function signInEnded(Response $response): bool
    {
        $error = $response->json('error') ?? $response->json('code');
        $error = is_array($error) ? ($error['code'] ?? '') : $error;
        if (in_array($error, ['invalid_client', 'unauthorized_client'], true)) return false;
        return in_array($response->status(), [400, 401], true)
            || in_array($error, ['invalid_grant', 'invalid_refresh_token', 'token_revoked', 'token_expired'], true);
    }
}
