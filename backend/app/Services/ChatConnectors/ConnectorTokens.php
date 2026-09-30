<?php

namespace App\Services\ChatConnectors;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/** The token-endpoint half of `ConnectorOAuth`: how to ask, and how to read the answer. */
final class ConnectorTokens
{
    /**
     * Figma's token endpoint identifies the app over Basic auth rather than as body
     * fields; a provider says so in its own catalogue block rather than this class
     * guessing from the slug.
     */
    public static function request(array $settings): PendingRequest
    {
        $request = Http::asForm()->acceptJson()->timeout(15);
        if (($settings['token_auth'] ?? null) === 'basic') {
            $request = $request->withBasicAuth((string) $settings['client_id'], (string) $settings['client_secret']);
        }
        return ($settings['token_encoding'] ?? null) === 'json' ? $request->asJson() : $request;
    }

    /**
     * The access token, its refresh token and lifetime, and the scopes the provider
     * actually granted, read under `$root` (Slack's user token lives under `authed_user.`).
     */
    public static function grant(Response $response, string $root, ?string $fallbackRefresh): array
    {
        $scope = $response->json($root.'scope');
        $refresh = $response->json($root.'refresh_token');
        return ['access' => (string) $response->json($root.'access_token'),
            'refresh' => is_string($refresh) && $refresh !== '' ? $refresh : $fallbackRefresh,
            'expires_in' => is_numeric($response->json($root.'expires_in')) ? (int) $response->json($root.'expires_in') : null,
            'scope' => is_string($scope) && $scope !== '' ? mb_substr($scope, 0, 2000) : null];
    }
}
