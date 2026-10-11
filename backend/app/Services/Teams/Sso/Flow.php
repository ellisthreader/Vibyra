<?php

namespace App\Services\Teams\Sso;

use App\Models\OrganizationSso;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * The authorization-code flow with PKCE (S256), `state` and `nonce`. Everything the callback needs is kept server-side under the
 * hash of `state`, one use only, ten minutes: the nonce, the PKCE verifier, the organization, how the person is signing in and, for
 * the browser, the hash of a second secret held in their session cookie (so a link planted by someone else cannot sign a victim into
 * the planter's account) or, for an app, the hash of the secret only that app knows (so only it can collect the result).
 */
final class Flow
{
    public function __construct(private readonly Discovery $discovery) {}

    /** @return array{authUrl:string,state:string} `state` lets the browser start bind the flow to its session */
    public function start(OrganizationSso $cfg, string $mode, ?string $binding = null, array $app = []): array
    {
        $meta = $this->discovery->get($cfg->issuer);
        $state = Str::random(64);
        $verifier = Str::random(96);
        $nonce = Str::random(64);
        $flowId = $mode === 'app' ? Str::random(64) : null;
        Cache::put(self::key($state), ['org' => $cfg->organization_id, 'nonce' => $nonce, 'verifier' => $verifier, 'mode' => $mode,
            'configurationHash' => Configuration::hash($cfg),
            'binding' => $binding === null ? null : hash('sha256', $binding), 'flowId' => $flowId, 'app' => $app,
            'meta' => $meta], now()->addMinutes((int) config('teams.sso_flow_minutes')));
        $query = http_build_query(['response_type' => 'code', 'client_id' => $cfg->client_id, 'redirect_uri' => Settings::redirectUri(),
            'scope' => config('teams.sso_scopes'), 'state' => $state, 'nonce' => $nonce,
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='), 'code_challenge_method' => 'S256'], '', '&', PHP_QUERY_RFC3986);
        $url = $meta['authorization_endpoint'].(str_contains($meta['authorization_endpoint'], '?') ? '&' : '?').$query;
        return ['authUrl' => $url, 'state' => $state, 'flowId' => $flowId];
    }

    /** Claim a flow by its `state`: exactly one caller gets it, once. */
    public function consume(string $state): array
    {
        if (!preg_match('/^[A-Za-z0-9]{64}$/D', $state)) throw new SsoException('sso_state', 'state');
        $flow = Cache::lock('team-sso-claim:'.hash('sha256', $state), 15)->block(5, fn () => Cache::pull(self::key($state)));
        if (!is_array($flow)) throw new SsoException('sso_state', 'unknown or used state');
        return $flow;
    }

    public static function key(string $state): string
    {
        return 'team-sso:state:'.hash('sha256', $state);
    }
}
