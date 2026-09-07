<?php

namespace App\Services\Integrations;

use Illuminate\Support\Facades\Http;

class OAuth
{
    public function authorize(array $p, array $flow): string
    {
        $query = ['client_id' => $p['settings']['client_id'], 'redirect_uri' => Catalog::callback($p['service']),
            'response_type' => 'code', 'scope' => $p['scope'], 'state' => $flow['state']];
        $url = match ($p['provider']) {
            'google' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'microsoft' => 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            'stripe' => 'https://marketplace.stripe.com/oauth/v2/authorize',
            'shopify' => 'https://'.$flow['shop'].'/admin/oauth/authorize',
            'github' => 'https://github.com/login/oauth/authorize',
        };
        if (in_array($p['provider'], ['google', 'microsoft', 'github'], true)) {
            $query += ['code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $flow['verifier'], true)), '+/', '-_'), '='),
                'code_challenge_method' => 'S256'];
        }
        if ($p['provider'] === 'google') {
            $query += ['access_type' => 'offline', 'prompt' => 'consent select_account'];
        }
        if ($p['provider'] === 'stripe') {
            unset($query['scope'], $query['response_type']);
            $install = $p['settings']['install_url'] ?? '';
            abort_unless(parse_url($install, PHP_URL_SCHEME) === 'https'
                && parse_url($install, PHP_URL_HOST) === 'marketplace.stripe.com'
                && parse_url($install, PHP_URL_PATH) === '/oauth/v2/authorize'
                && ! parse_url($install, PHP_URL_USER) && ! parse_url($install, PHP_URL_PORT), 503, 'Stripe install link is not configured.');
            parse_str(parse_url($install, PHP_URL_QUERY) ?? '', $parameters);
            // Preserve the mode-specific link supplied by Stripe, overriding state and redirect ourselves.
            $query = array_replace($parameters, $query);
        }

        return $url.'?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    public function token(array $p, array $flow, array $grant): array
    {
        $url = match ($p['provider']) {
            'google' => 'https://oauth2.googleapis.com/token',
            'microsoft' => 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            'stripe' => 'https://api.stripe.com/v1/oauth/token',
            'shopify' => 'https://'.Catalog::shop($flow['shop']).'/admin/oauth/access_token',
            'github' => 'https://github.com/login/oauth/access_token',
        };
        $request = Http::timeout(20)->connectTimeout(10)->withoutRedirecting()->acceptJson()->asForm();
        $body = $grant;
        if ($p['provider'] === 'stripe') {
            $request = $request->withBasicAuth($p['settings']['client_secret'], '');
        } else {
            $body += ['client_id' => $p['settings']['client_id'], 'client_secret' => $p['settings']['client_secret']];
            if (isset($grant['code'])) {
                $body += ['redirect_uri' => Catalog::callback($p['service']), 'code_verifier' => $flow['verifier']];
            }
        }
        if ($p['provider'] === 'shopify' && isset($grant['code'])) {
            $body['expiring'] = 1;
            unset($body['grant_type'], $body['code_verifier'], $body['redirect_uri']);
        }
        $response = $request->post($url, $body);
        // Never propagate a provider response, exception URL or credential into application errors.
        abort_unless($response->successful() && is_string($response->json('access_token')), 409,
            'Authorisation failed. Reconnect this account.');
        $tokens = $response->json();
        $this->scopes($p, $tokens);

        return $tokens;
    }

    public function scopes(array $p, array $tokens): void
    {
        if (in_array($p['provider'], ['stripe', 'github'], true)) {
            return;
        }
        abort_unless(is_string($tokens['scope'] ?? null), 409, 'The provider did not confirm access. Reconnect.');
        $actual = preg_split('/[ ,]+/', $tokens['scope']);
        foreach (preg_split('/[ ,]+/', $p['scope']) as $scope) {
            if (in_array($scope, ['openid', 'email', 'offline_access'], true)) {
                continue;
            }
            abort_unless(in_array($scope, $actual, true), 409, 'Required read access was declined. Reconnect to allow it.');
        }
    }

    public function verifyShop(array $p, array $flow, array $query): void
    {
        abort_unless(($query['shop'] ?? '') === ($flow['shop'] ?? ''), 400, 'Store mismatch.');
        abort_unless(count(array_filter($query, fn ($v) => ! is_string($v))) === 0, 400, 'Invalid callback parameters.');
        $hmac = $query['hmac'] ?? '';
        unset($query['hmac']);
        ksort($query);
        abort_unless(is_string($hmac) && hash_equals(hash_hmac('sha256', http_build_query($query),
            $p['settings']['client_secret']), $hmac), 400, 'Invalid store signature.');
    }
}
