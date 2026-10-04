<?php

namespace App\Services\ChatConnectors;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * The bookkeeping half of a sign-in: a single-use `state` held in the cache for ten
 * minutes, and the outcome kept under a separate flow id with the account it
 * belongs to, for the app to read back. Shared by the connector sign-in
 * (`ConnectorOAuth`) and Agent V2's remote MCP sign-in, so both keep the same
 * replay, expiry and return-link rules.
 */
final class OAuthFlows
{
    public const MINUTES = 10;

    public const CANCELLED = 'You cancelled the sign-in.';

    /** @return array{flowId: string, state: string, verifier: string, nonce: string} */
    public function begin(int $userId, ?string $returnUrl, array $extra): array
    {
        $flowId = (string) Str::uuid();
        $state = Str::random(48);
        $verifier = Str::random(64);
        $nonce = Str::random(48);
        Cache::put($this->stateKey($state), [...$extra, 'userId' => $userId, 'flowId' => $flowId, 'verifier' => $verifier,
            'nonce' => hash('sha256', $nonce), 'return' => $this->safeReturn($returnUrl)], now()->addMinutes(self::MINUTES));
        $this->record($flowId, $userId, ['status' => 'pending']);
        return ['flowId' => $flowId, 'state' => $state, 'verifier' => $verifier, 'nonce' => $nonce];
    }

    /**
     * The link `start` hands the app instead of the provider's page: Vibyra's own hop. Opening it only shows a page
     * that names the provider and the (masked) Vibyra account; pressing Continue there sets the binding cookie (scoped
     * to this flow's callback path) and sends the browser on. The callback refuses any browser that did not press it,
     * and the person who does sees whose account they are connecting to, so a forwarded link is caught.
     */
    public function entry(array $begun, string $providerUrl, string $callbackPath, string $provider, ?string $baseUrl = null): string
    {
        $name = trim((string) preg_replace('/[\p{Cc}\p{Cf}]+/u', ' ', $provider)); // a server's own name: no control or bidi characters
        Cache::put($this->hopKey($begun['flowId']), ['url' => $providerUrl, 'nonce' => $begun['nonce'], 'path' => $callbackPath,
            'cookie' => self::cookieName($begun['state']), 'state' => $begun['state'], 'provider' => Str::limit($name, 60, '…') ?: 'this service'],
            now()->addMinutes(self::MINUTES));
        return rtrim($baseUrl ?? (string) config('app.url'), '/').'/api/connectors/begin/'.$begun['flowId'];
    }

    /** What the confirmation page shows, without spending the link: the provider's name and the masked account that started the flow. */
    public function peek(string $flowId): ?array
    {
        $hop = Cache::get($this->hopKey($flowId));
        $flow = is_array($hop) && is_string($hop['state'] ?? null) ? Cache::get($this->stateKey($hop['state'])) : null;
        if (!is_array($flow)) return null;
        return ['provider' => (string) ($hop['provider'] ?? 'this service'),
            'account' => AccountMask::for(User::query()->find((int) ($flow['userId'] ?? 0)))];
    }

    /** What the hop redirects to and which cookie it sets. The first to press wins; the marker is an atomic add, so two at once cannot both. */
    public function open(string $flowId): ?array
    {
        $key = $this->hopKey($flowId);
        if (!Cache::has($key) || !Cache::add($key.':spent', true, now()->addMinutes(self::MINUTES))) return null;
        $hop = Cache::pull($key);
        return is_array($hop) ? $hop : null;
    }

    /** "This isn't my account": spends the link and the provider's state, and tells the app why. @return ?array{flow: array, provider: string} */
    public function cancel(string $flowId): ?array
    {
        $hop = $this->open($flowId);
        $flow = is_array($hop) && is_string($hop['state'] ?? null) ? Cache::pull($this->stateKey($hop['state'])) : null;
        if (!is_array($flow)) return null;
        $this->fail($flow, self::CANCELLED);
        return ['flow' => $flow, 'provider' => (string) ($hop['provider'] ?? 'The service')];
    }

    public static function cookieName(string $state): string
    {
        return 'vb_oauth_'.substr(hash('sha256', $state), 0, 24);
    }

    /** The nonce this browser presents for the callback's `state` ('' when it never opened the link). */
    public static function presented(Request $request): string
    {
        $value = $request->cookies->get(self::cookieName((string) $request->query('state', '')));
        return is_string($value) ? $value : '';
    }

    /**
     * The flow a `state` started, exactly once, for the browser that opened its link. Cache::pull alone is a
     * get/delete pair and can be replayed concurrently. A browser without the nonce spends the state, fails
     * the flow, and gets nothing: the provider's code is never exchanged.
     */
    public function claim(string $state, string $binding): ?array
    {
        $key = $this->stateKey($state);
        if ($state === '' || !Cache::add($key.':claimed', true, now()->addMinutes(self::MINUTES))) return null;
        $flow = Cache::pull($key);
        if (!is_array($flow)) return null;
        if ($binding === '' || !is_string($flow['nonce'] ?? null) || !hash_equals($flow['nonce'], hash('sha256', $binding))) {
            $this->fail($flow, 'The sign-in has to finish in the browser that opened it. Please start again from Vibyra.');
            return null;
        }
        return $flow;
    }

    public static function challenge(string $verifier): string
    {
        return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    }

    public function succeed(array $flow, array $extra = []): void
    {
        $this->record((string) $flow['flowId'], (int) $flow['userId'], [...$extra, 'status' => 'connected']);
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

    /** Only the app's own link schemes: never a web page, so this cannot be used to bounce a browser anywhere. */
    private function safeReturn(?string $returnUrl): ?string
    {
        if (!is_string($returnUrl) || $returnUrl === '' || strlen($returnUrl) > 500) return null;
        $scheme = strtolower((string) parse_url($returnUrl, PHP_URL_SCHEME));
        $parts = parse_url($returnUrl);
        if (!$parts || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) return null;
        if ($returnUrl === 'vibyra://integrations/connected') return $returnUrl;
        return in_array($scheme, ['exp', 'exps'], true) && ($parts['path'] ?? '') === '/--/integrations/connected'
            && $this->developerHost((string) ($parts['host'] ?? '')) ? $returnUrl : null;
    }

    /**
     * Expo Go links exist for a developer's own Metro server, so they are honoured outside production and only for
     * loopback, private-network and `.local` hosts; an `exp://` link to any other host opens whatever bundle that host serves.
     */
    private function developerHost(string $host): bool
    {
        if (app()->environment('production') || $host === '') return false;
        $host = strtolower(trim($host, '[]'));
        if (filter_var($host, FILTER_VALIDATE_IP)) return filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
        return $host === 'localhost' || (bool) preg_match('/^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/', $host);
    }

    private function record(string $flowId, int $userId, array $result): void
    {
        Cache::put($this->resultKey($flowId), [...$result, 'userId' => $userId], now()->addMinutes(self::MINUTES));
    }

    private function stateKey(string $state): string
    {
        return 'chat-connectors:oauth:state:'.hash('sha256', $state);
    }

    private function resultKey(string $flowId): string
    {
        return 'chat-connectors:oauth:flow:'.$flowId;
    }

    private function hopKey(string $flowId): string
    {
        return 'chat-connectors:oauth:hop:'.$flowId;
    }
}
