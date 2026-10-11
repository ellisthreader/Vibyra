<?php

namespace App\Services\Teams\Sso;

use App\Models\OrganizationSso;
use App\Services\AgentRuns\Mcp\{McpError, SafeHttp};
use Illuminate\Support\Facades\Crypt;

/** Trade the authorization code (with the PKCE verifier) for an ID token at the issuer's token endpoint, through SafeHttp. */
final class Exchange
{
    public function __construct(private readonly SafeHttp $http) {}

    public function idToken(OrganizationSso $cfg, array $flow, string $code): string
    {
        $secret = Crypt::decryptString($cfg->client_secret);
        $form = ['grant_type' => 'authorization_code', 'code' => $code, 'redirect_uri' => Settings::redirectUri(),
            'client_id' => $cfg->client_id, 'code_verifier' => $flow['verifier']];
        $headers = ['Accept' => 'application/json'];
        if (($flow['meta']['auth_method'] ?? 'post') === 'basic') $headers['Authorization'] = 'Basic '.base64_encode(rawurlencode($cfg->client_id).':'.rawurlencode($secret));
        else $form['client_secret'] = $secret;
        try {
            $response = $this->http->send('POST', $flow['meta']['token_endpoint'], ['headers' => $headers, 'form' => $form]);
        } catch (McpError) {
            throw new SsoException('sso_provider', 'The token endpoint could not be reached.');
        }
        $token = $response->successful() ? $response->json('id_token') : null;
        if (!is_string($token) || $token === '') throw new SsoException('sso_provider', 'The provider did not return an ID token.');
        return $token;
    }
}
