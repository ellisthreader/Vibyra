<?php

namespace App\Services\ChatConnectors;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Str;

/**
 * Connecting by signing in to the service rather than pasting a key. The phone
 * opens the provider's own page in the system sign-in sheet; the provider sends
 * the browser back here with a code; the code is exchanged for an access token,
 * which is proved and stored exactly like a pasted key; and the browser is sent
 * on to the app, which closes the sheet.
 *
 * Each attempt is a `state` held in the cache for ten minutes and pulled on use,
 * so a replayed or expired callback connects nothing. The outcome is kept under a
 * separate flow id, with the account it belongs to, for the phone to read back.
 *
 * What to ask each provider for lives in the catalogue's `oauth` block, so adding
 * a provider is configuration: the pages, the scope, and which fields its token
 * endpoint takes (Stripe's refuses fields it does not expect).
 */
class ConnectorOAuth
{
    private const FLOW_MINUTES = 10;

    public function configured(string $slug): bool
    {
        $settings = $this->settings($slug);
        return ($settings['authorize_url'] ?? '') !== '' && (string) ($settings['client_id'] ?? '') !== ''
            && (string) ($settings['client_secret'] ?? '') !== '';
    }

    /** The provider's page to open, and the flow id the phone reads the outcome from. */
    public function start(int $userId, string $slug, ?string $returnUrl): array
    {
        abort_unless($this->configured($slug), 422, $this->name($slug).' sign-in is not available right now. Please try again later.');
        $flowId = (string) Str::uuid();
        $state = Str::random(48);
        $verifier = Str::random(64);
        Cache::put($this->stateKey($state), ['userId' => $userId, 'slug' => $slug, 'flowId' => $flowId,
            'verifier' => $verifier, 'return' => $this->safeReturn($returnUrl)], now()->addMinutes(self::FLOW_MINUTES));
        $this->record($flowId, $userId, ['status' => 'pending']);
        $settings = $this->settings($slug);
        $query = array_filter([
            'response_type' => 'code', 'client_id' => (string) $settings['client_id'],
            'redirect_uri' => $this->redirectUri($slug), 'scope' => (string) ($settings['scope'] ?? ''), 'state' => $state,
        ], fn ($value) => $value !== '');
        if ($settings['pkce'] ?? false) {
            $query['code_challenge_method'] = 'S256';
            $query['code_challenge'] = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
        }
        return ['flowId' => $flowId, 'url' => $settings['authorize_url'].'?'.http_build_query($query)];
    }

    /**
     * The provider's answer. Returns the flow it belonged to and, when the provider
     * agreed, the access token; a flow with no token has already recorded why. An
     * unknown or reused `state` returns no flow at all and connects nothing.
     *
     * @return array{0: ?array, 1: ?array{access: string, refresh: ?string, expires_in: ?int}}
     */
    public function finish(string $slug, string $state, string $code, string $error = ''): array
    {
        // Atomic claim: Cache::pull alone is a get/delete pair and can be replayed concurrently.
        $key = $this->stateKey($state);
        if ($state === '' || !Cache::add($key.':claimed', true, now()->addMinutes(self::FLOW_MINUTES))) return [null, null];
        $flow = Cache::pull($key);
        if (!is_array($flow) || ($flow['slug'] ?? '') !== $slug) return [null, null];
        if (!config('chat_connectors.enabled')) {
            $this->fail($flow, 'Integrations are temporarily unavailable.');
            return [$flow, null];
        }
        if ($error !== '' || $code === '') {
            $this->fail($flow, $error === 'access_denied' ? 'You cancelled the sign-in.' : 'The sign-in did not finish. Please try again.');
            return [$flow, null];
        }
        $settings = $this->settings($slug);
        $fields = [
            'client_id' => (string) $settings['client_id'], 'client_secret' => (string) $settings['client_secret'],
            'code_verifier' => $flow['verifier'], 'code' => $code, 'redirect_uri' => $this->redirectUri($slug), 'grant_type' => 'authorization_code',
        ];
        $wanted = (array) ($settings['token_fields'] ?? array_keys($fields));
        $request = Http::asForm()->acceptJson()->timeout(15);
        // Figma's token endpoint identifies the app over Basic auth rather than as
        // body fields; a provider says so in its own catalogue block rather than
        // this class guessing from the slug.
        if (($settings['token_auth'] ?? null) === 'basic') {
            $request = $request->withBasicAuth((string) $settings['client_id'], (string) $settings['client_secret']);
        }
        try {
            $response = $request->post((string) $settings['token_url'], array_intersect_key($fields, array_flip($wanted)));
        } catch (ConnectionException $e) {
            $this->fail($flow, $this->name($slug).' could not be reached. Please try again.');
            return [$flow, null];
        }
        $token = (string) ($response->json('access_token') ?? '');
        if (!$response->successful() || $token === '') {
            $this->fail($flow, $this->name($slug).' did not finish the connection. Please try again.');
            return [$flow, null];
        }
        // The refresh token and lifetime are part of the grant. Reading only the
        // access token off this response is what used to make a Figma connection
        // unrenewable, and so silently dead ninety days later.
        return [$flow, ['access' => $token, 'refresh' => $this->text($response->json('refresh_token')),
            'expires_in' => is_numeric($response->json('expires_in')) ? (int) $response->json('expires_in') : null]];
    }

    /** Whether this provider's tokens can be traded for a fresh one at all. */
    public function renewable(string $slug): bool
    {
        return (string) ($this->settings($slug)['refresh_url'] ?? '') !== '';
    }

    /**
     * A later access token for the same connection. Returns null when the provider
     * refuses, which leaves the stored token in place to fail on its own terms
     * rather than dropping a connection this code cannot prove is dead.
     */
    public function renew(string $slug, string $refresh): ?array
    {
        $settings = $this->settings($slug);
        if (!$this->renewable($slug) || $refresh === '') return null;
        $request = Http::asForm()->acceptJson()->timeout(15);
        if (($settings['token_auth'] ?? null) === 'basic') {
            $request = $request->withBasicAuth((string) $settings['client_id'], (string) $settings['client_secret']);
        }
        try { $response = $request->post((string) $settings['refresh_url'], ['refresh_token' => $refresh]); }
        catch (ConnectionException $e) { return null; }
        $token = (string) ($response->json('access_token') ?? '');
        if (!$response->successful() || $token === '') return null;
        // Figma keeps one access token per user per app and returns no new refresh
        // token here, so the one already stored stays the one to use next time.
        return ['access' => $token, 'refresh' => $this->text($response->json('refresh_token')) ?? $refresh,
            'expires_in' => is_numeric($response->json('expires_in')) ? (int) $response->json('expires_in') : null];
    }

    private function text(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    public function succeed(array $flow): void
    {
        $this->record((string) $flow['flowId'], (int) $flow['userId'], ['status' => 'connected']);
    }

    public function fail(array $flow, string $message): void
    {
        $this->record((string) $flow['flowId'], (int) $flow['userId'], ['status' => 'failed', 'error' => $message]);
    }

    /** The outcome for its own account only; anyone else's flow reads as expired. */
    public function status(string $flowId, int $userId): array
    {
        $result = Cache::get($this->resultKey($flowId));
        if (!is_array($result) || (int) ($result['userId'] ?? 0) !== $userId) return ['status' => 'expired'];
        return array_diff_key($result, ['userId' => true]);
    }

    /** Where the browser goes when it is done: back to the app, carrying the outcome. */
    public function returnTo(array $flow): ?string
    {
        $return = $flow['return'] ?? null;
        if (!is_string($return) || $return === '') return null;
        $status = $this->status((string) $flow['flowId'], (int) $flow['userId'])['status'];
        return $return.(str_contains($return, '?') ? '&' : '?').http_build_query(['flow' => $flow['flowId'], 'status' => $status]);
    }

    public function name(string $slug): string
    {
        return (string) config('chat_connectors.catalogue.'.$slug.'.name', 'This service');
    }

    /** The page the provider sends the browser back to; it must match what is registered with it. */
    public function redirectUri(string $slug): string
    {
        return rtrim((string) config('app.url'), '/').'/api/connectors/callback/'.$slug;
    }

    private function settings(string $slug): array
    {
        return (array) config('chat_connectors.catalogue.'.$slug.'.oauth', []);
    }

    /** Only the app's own link schemes: never a web page, so this cannot be used to bounce a browser anywhere. */
    private function safeReturn(?string $returnUrl): ?string
    {
        if (!is_string($returnUrl) || $returnUrl === '' || strlen($returnUrl) > 500) return null;
        $scheme = strtolower((string) parse_url($returnUrl, PHP_URL_SCHEME));
        $parts = parse_url($returnUrl);
        if (!$parts || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) return null;
        if ($returnUrl === 'vibyra://integrations/connected') return $returnUrl;
        return in_array($scheme, ['exp', 'exps'], true) && !empty($parts['host'])
            && ($parts['path'] ?? '') === '/--/integrations/connected' ? $returnUrl : null;
    }

    private function record(string $flowId, int $userId, array $result): void
    {
        Cache::put($this->resultKey($flowId), [...$result, 'userId' => $userId], now()->addMinutes(self::FLOW_MINUTES));
    }

    private function stateKey(string $state): string
    {
        return 'chat-connectors:oauth:state:'.hash('sha256', $state);
    }

    private function resultKey(string $flowId): string
    {
        return 'chat-connectors:oauth:flow:'.$flowId;
    }
}
