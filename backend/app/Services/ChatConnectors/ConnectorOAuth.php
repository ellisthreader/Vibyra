<?php

namespace App\Services\ChatConnectors;

use Illuminate\Http\Client\ConnectionException;

/**
 * Connecting by signing in to the service rather than pasting a key. The phone
 * opens Vibyra's own link in the system sign-in sheet (it binds that browser, then
 * redirects to the provider's page); the provider sends
 * the browser back here with a code; the code is exchanged for an access token,
 * which is proved and stored exactly like a pasted key; and the browser is sent
 * on to the app, which closes the sheet.
 *
 * Each attempt is a single-use `state` (see `OAuthFlows`), so a replayed or
 * expired callback connects nothing, and the outcome is kept under a separate flow
 * id, with the account it belongs to, for the phone to read back.
 *
 * What to ask each provider for lives in the catalogue's `oauth` block, so adding
 * a provider is configuration: the pages, the scope, and which fields its token
 * endpoint takes (Stripe's refuses fields it does not expect).
 */
class ConnectorOAuth
{
    public function __construct(private readonly OAuthFlows $flows) {}

    public function configured(string $slug): bool
    {
        $settings = $this->settings($slug);
        return ($settings['authorize_url'] ?? '') !== '' && (string) ($settings['client_id'] ?? '') !== ''
            && (string) ($settings['client_secret'] ?? '') !== '';
    }

    /**
     * The provider's page to open, and the flow id the phone reads the outcome from.
     * `add_account` (Agent V2) stores the account as an extra `agent_connections` row
     * instead of replacing the single install ordinary chat uses; it asks Google to
     * show the account picker and may request the provider's wider `agent_scope`
     * (and Slack's `agent_user_scope`, a user token that can search messages).
     */
    public function start(int $userId, string $slug, ?string $returnUrl, string $mode = 'install'): array
    {
        abort_unless($this->configured($slug), 422, $this->name($slug).' sign-in is not available right now. Please try again later.');
        $flow = $this->flows->begin($userId, $returnUrl, ['slug' => $slug, 'mode' => $mode]);
        $settings = $this->settings($slug);
        $agent = $mode === 'add_account';
        $query = array_filter([
            'response_type' => 'code', 'client_id' => (string) $settings['client_id'],
            'redirect_uri' => $this->redirectUri($slug), 'scope' => (string) ($agent && !empty($settings['agent_scope'])
                ? $settings['agent_scope'] : ($settings['scope'] ?? '')), 'state' => $flow['state'],
            'user_scope' => $agent ? (string) ($settings['agent_user_scope'] ?? '') : '',
            'access_type' => (string) ($settings['access_type'] ?? ''),
            'prompt' => $agent && ($settings['prompt'] ?? '') === 'consent'
                ? 'select_account consent' : (string) ($settings['prompt'] ?? ''),
        ], fn ($value) => $value !== '');
        foreach ((array) ($settings['authorize_params'] ?? []) as $key => $value) {
            if (is_string($key) && is_string($value)) $query[$key] = $value;
        }
        if ($settings['pkce'] ?? false) {
            $query['code_challenge_method'] = 'S256';
            $query['code_challenge'] = OAuthFlows::challenge($flow['verifier']);
        }
        // The app opens Vibyra's own link, never the provider's page: that hop binds this browser (OAuthFlows::entry).
        return ['flowId' => $flow['flowId'], 'url' => $this->flows->entry($flow, $settings['authorize_url'].'?'.http_build_query($query),
            parse_url($this->redirectUri($slug), PHP_URL_PATH), $this->name($slug), $this->callbackBaseUrl($slug))];
    }

    /**
     * The provider's answer. Returns the flow it belonged to and, when the provider
     * agreed, the access token; a flow with no token has already recorded why. An
     * unknown or reused `state`, or a browser that never opened the flow's link
     * (`$binding` is its cookie nonce), returns no flow at all and connects nothing.
     *
     * @return array{0: ?array, 1: ?array{access: string, refresh: ?string, expires_in: ?int, scope: ?string}}
     */
    public function finish(string $slug, string $state, string $code, string $error = '', string $binding = ''): array
    {
        $flow = $this->flows->claim($state, $binding);
        if (!$flow || ($flow['slug'] ?? '') !== $slug) return [null, null];
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
        try {
            $response = ConnectorTokens::request($settings)->post((string) $settings['token_url'], array_intersect_key($fields, array_flip($wanted)));
        } catch (ConnectionException $e) {
            $this->fail($flow, $this->name($slug).' could not be reached. Please try again.');
            return [$flow, null];
        }
        // Slack returns a user token (the one that may search) under `authed_user`.
        $root = ($flow['mode'] ?? '') === 'add_account' && !empty($settings['agent_user_scope'])
            ? (string) ($settings['agent_token_root'] ?? 'authed_user').'.' : '';
        $token = (string) ($response->json($root.'access_token') ?? '');
        if (!$response->successful() || $token === '') {
            $this->fail($flow, $this->name($slug).' did not finish the connection. Please try again.');
            return [$flow, null];
        }
        // The refresh token and lifetime are part of the grant. Reading only the
        // access token off this response is what used to make a Figma connection
        // unrenewable, and so silently dead ninety days later.
        return [$flow, ConnectorTokens::grant($response, $root, null)];
    }

    /** Whether this provider's tokens can be traded for a fresh one at all. */
    public function renewable(string $slug): bool
    {
        return (string) ($this->settings($slug)['refresh_url'] ?? '') !== '';
    }

    /**
     * A later access token for the same connection. Returns null when the provider
     * cannot be asked or answers oddly, and throws ReconnectRequired when it refuses
     * the refresh token itself (400/401); either way `Installs` leaves the stored token in place to fail on its own terms
     * rather than dropping a connection this code cannot prove is dead.
     */
    public function renew(string $slug, string $refresh): ?array
    {
        $settings = $this->settings($slug);
        if (!$this->renewable($slug) || $refresh === '') return null;
        $fields = ['refresh_token' => $refresh, 'grant_type' => 'refresh_token',
            'client_id' => (string) ($settings['client_id'] ?? ''),
            'client_secret' => (string) ($settings['client_secret'] ?? '')];
        $wanted = (array) ($settings['refresh_fields'] ?? ['refresh_token']);
        try { $response = ConnectorTokens::request($settings)->post((string) $settings['refresh_url'], array_intersect_key($fields, array_flip($wanted))); }
        catch (ConnectionException $e) { return null; }
        // The provider says this refresh token is dead: only a new sign-in helps.
        if (in_array($response->status(), [400, 401], true)) throw ReconnectRequired::for($slug);
        $token = (string) ($response->json('access_token') ?? '');
        if (!$response->successful() || $token === '') return null;
        // Figma keeps one access token per user per app and returns no new refresh
        // token here, so the one already stored stays the one to use next time.
        return ConnectorTokens::grant($response, '', $refresh);
    }

    public function succeed(array $flow, array $extra = []): void
    {
        $this->flows->succeed($flow, $extra);
    }

    public function fail(array $flow, string $message): void
    {
        $this->flows->fail($flow, $message);
    }

    /** The outcome for its own account only; anyone else's flow reads as expired. */
    public function status(string $flowId, int $userId): array
    {
        return $this->flows->status($flowId, $userId);
    }

    /** Where the browser goes when it is done: back to the app, carrying the outcome. */
    public function returnTo(array $flow): ?string
    {
        return $this->flows->returnTo($flow);
    }

    public function name(string $slug): string
    {
        return (string) config('chat_connectors.catalogue.'.$slug.'.name', 'This service');
    }

    /** The page the provider sends the browser back to; it must match what is registered with it. */
    public function redirectUri(string $slug): string
    {
        return $this->callbackBaseUrl($slug).'/api/connectors/callback/'.$slug;
    }

    /**
     * One provider can move to another registered origin (Google to vibyra.net) while the
     * rest stay where their apps are registered. The confirmation hop follows, so its
     * host-only binding cookie still reaches the callback.
     */
    private function callbackBaseUrl(string $slug): string
    {
        return rtrim(trim((string) ($this->settings($slug)['callback_base_url'] ?? ''))
            ?: trim((string) config('chat_connectors.callback_base_url')) ?: (string) config('app.url'), '/');
    }

    private function settings(string $slug): array
    {
        return (array) config('chat_connectors.catalogue.'.$slug.'.oauth', []);
    }
}
