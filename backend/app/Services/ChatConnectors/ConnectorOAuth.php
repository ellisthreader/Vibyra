<?php

namespace App\Services\ChatConnectors;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
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

    /** Where a finished sign-in may return to: the app, in a store build or in Expo Go. */
    private const RETURN_SCHEMES = ['vibyra', 'exp', 'exps'];

    /** Whether this provider's sign-in can also sign a person in to Vibyra (GitHub can; Stripe cannot). */
    public function signsIn(string $slug): bool
    {
        return $this->configured($slug) && (bool) ($this->settings($slug)['signs_in'] ?? false);
    }

    public function configured(string $slug): bool
    {
        $settings = $this->settings($slug);
        return ($settings['authorize_url'] ?? '') !== '' && (string) ($settings['client_id'] ?? '') !== ''
            && (string) ($settings['client_secret'] ?? '') !== '';
    }

    /**
     * The provider's page to open, and the flow id the phone reads the outcome from.
     * With no account, only a provider that can sign a person in may start: the
     * callback then finds or makes the Vibyra account from the provider's identity.
     */
    public function start(?int $userId, string $slug, ?string $returnUrl): array
    {
        abort_unless($this->configured($slug), 422, 'Signing in to '.$this->name($slug).' is not set up on this server yet.');
        abort_if($userId === null && !$this->signsIn($slug), 401, 'Sign in to Vibyra to connect '.$this->name($slug).'.');
        $flowId = (string) Str::uuid();
        $state = Str::random(48);
        Cache::put($this->stateKey($state), ['userId' => $userId, 'slug' => $slug, 'flowId' => $flowId,
            'return' => $this->safeReturn($returnUrl)], now()->addMinutes(self::FLOW_MINUTES));
        $this->record($flowId, $userId, ['status' => 'pending', 'anonymous' => $userId === null]);
        $settings = $this->settings($slug);
        $query = array_filter([
            'response_type' => 'code', 'client_id' => (string) $settings['client_id'],
            'redirect_uri' => $this->redirectUri($slug), 'scope' => (string) ($settings['scope'] ?? ''), 'state' => $state,
        ], fn ($value) => $value !== '');
        return ['flowId' => $flowId, 'url' => $settings['authorize_url'].'?'.http_build_query($query)];
    }

    /**
     * The provider's answer. Returns the flow it belonged to and, when the provider
     * agreed, the access token; a flow with no token has already recorded why. An
     * unknown or reused `state` returns no flow at all and connects nothing.
     *
     * @return array{0: ?array, 1: ?string}
     */
    public function finish(string $slug, string $state, string $code, string $error = ''): array
    {
        $flow = $state === '' ? null : Cache::pull($this->stateKey($state));
        if (!is_array($flow) || ($flow['slug'] ?? '') !== $slug) return [null, null];
        if ($error !== '' || $code === '') {
            $this->fail($flow, $error === 'access_denied' ? 'You cancelled the sign-in.' : 'The sign-in did not finish. Please try again.');
            return [$flow, null];
        }
        $settings = $this->settings($slug);
        $fields = [
            'client_id' => (string) $settings['client_id'], 'client_secret' => (string) $settings['client_secret'],
            'code' => $code, 'redirect_uri' => $this->redirectUri($slug), 'grant_type' => 'authorization_code',
        ];
        $wanted = (array) ($settings['token_fields'] ?? array_keys($fields));
        $response = Http::asForm()->acceptJson()->timeout(15)
            ->post((string) $settings['token_url'], array_intersect_key($fields, array_flip($wanted)));
        $token = (string) ($response->json('access_token') ?? '');
        if (!$response->successful() || $token === '') {
            $this->fail($flow, $this->name($slug).' did not finish the connection. Please try again.');
            return [$flow, null];
        }
        return [$flow, $token];
    }

    /** `session` is the Vibyra sign-in a provider identity produced, for a phone that started signed out. */
    public function succeed(array $flow, int $userId, ?array $session = null): void
    {
        $this->record((string) $flow['flowId'], $userId, ['status' => 'connected',
            'anonymous' => $flow['userId'] === null] + ($session ? ['session' => $session] : []));
    }

    public function fail(array $flow, string $message): void
    {
        $this->record((string) $flow['flowId'], $flow['userId'] === null ? null : (int) $flow['userId'],
            ['status' => 'failed', 'error' => $message, 'anonymous' => $flow['userId'] === null]);
    }

    /**
     * The outcome, to its own account, or - for a sign-in begun signed out - to the
     * phone that began it, which alone was handed the flow id. Anyone else reads
     * "expired". The Vibyra session a signed-out sign-in produced goes only to that
     * phone; a signed-in reader never needs it.
     */
    public function status(string $flowId, ?int $userId): array
    {
        $result = Cache::get($this->resultKey($flowId));
        if (!is_array($result)) return ['status' => 'expired'];
        $anonymous = (bool) ($result['anonymous'] ?? false);
        $owner = isset($result['userId']) ? (int) $result['userId'] : null;
        if ($userId !== null ? $owner !== $userId : !$anonymous) return ['status' => 'expired'];
        $visible = array_diff_key($result, ['userId' => true, 'anonymous' => true, 'session' => true]);
        if ($userId === null && isset($result['session'])) $visible['session'] = $result['session'];
        return $visible;
    }

    /** Whose catalogue a flow's reader should see: their own, or the account a signed-out sign-in produced. */
    public function owner(string $flowId): ?int
    {
        $result = Cache::get($this->resultKey($flowId));
        return is_array($result) && isset($result['userId']) ? (int) $result['userId'] : null;
    }

    /**
     * Who the person is at the provider, as the provider-sign-in account service
     * expects it: a stable subject, a verified email, and a name. GitHub hides the
     * email from `/user` unless it is public, so the verified primary one is read
     * from `/user/emails`, which the `user:email` scope allows.
     *
     * @return array{subject: string, email: ?string, name: ?string}
     */
    public function identify(string $slug, string $token): array
    {
        $identity = (array) ($this->settings($slug)['identity'] ?? []);
        $user = Http::withToken($token)->acceptJson()->timeout(15)->get((string) ($identity['user'] ?? ''));
        abort_unless($user->successful() && $user->json('id'), 422, $this->name($slug).' did not say who you are. Please try again.');
        $email = null;
        foreach ((array) Http::withToken($token)->acceptJson()->timeout(15)->get((string) ($identity['emails'] ?? ''))->json() as $row) {
            if (is_array($row) && ($row['primary'] ?? false) && ($row['verified'] ?? false) && is_string($row['email'] ?? null)) {
                $email = strtolower($row['email']);
            }
        }
        $name = trim((string) ($user->json('name') ?: $user->json('login')));
        return ['subject' => (string) $user->json('id'), 'email' => $email, 'name' => $name === '' ? null : $name];
    }

    /** Where the browser goes when it is done: back to the app, carrying the outcome. */
    public function returnTo(array $flow): ?string
    {
        $return = $flow['return'] ?? null;
        if (!is_string($return) || $return === '') return null;
        $result = Cache::get($this->resultKey((string) $flow['flowId']));
        $status = is_array($result) ? (string) ($result['status'] ?? 'expired') : 'expired';
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
        return in_array($scheme, self::RETURN_SCHEMES, true) ? $returnUrl : null;
    }

    private function record(string $flowId, ?int $userId, array $result): void
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
