<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\ApiError;
use App\Services\Platform\{ApiKeys, WebhookEndpoints};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The portal's Developer page: personal API keys and outbound webhooks. Answers only to the signed-in browser session (cookie),
 * never to an API key, so a key cannot create, widen or revoke keys or webhooks. Each half is 404 while its flag is off.
 */
final class DeveloperController extends Controller
{
    public function show(Request $request, ApiKeys $keys, WebhookEndpoints $hooks)
    {
        $user = $this->account($request);
        $flags = ['apiKeys' => ApiKeys::enabled(), 'webhooks' => WebhookEndpoints::enabled(),
            'mcpServer' => ApiKeys::enabled() && (bool) config('platform.mcp_server'), 'apiTrigger' => (bool) config('platform.api_trigger')];
        if (!$flags['apiKeys'] && !$flags['webhooks']) ApiError::throw(404, 'not_available', 'The developer API is not switched on.');
        return response()->json(['flags' => $flags, 'scopes' => ApiKeys::SCOPES, 'events' => WebhookEndpoints::EVENTS,
            'apiBase' => url('/api/platform/v1'), 'mcpUrl' => $flags['mcpServer'] ? url('/api/platform/mcp') : null,
            'keys' => $flags['apiKeys'] ? array_map(fn ($k) => $keys->payload($k), $keys->list($user->id)) : [],
            'webhooks' => $flags['webhooks'] ? array_map(fn ($w) => $hooks->payload($w), $hooks->list($user->id)) : []]);
    }

    public function createKey(Request $request, ApiKeys $keys)
    {
        $user = $this->account($request, 'keys');
        $data = $request->validate(['name' => 'required|string|min:1|max:60', 'scopes' => 'required|array|min:1|max:4',
            'scopes.*' => ['string', Rule::in(ApiKeys::SCOPES)], 'ratePerMinute' => 'sometimes|integer|min:1|max:'.(int) config('platform.max_rate_per_minute')]);
        [$key, $secret] = $keys->create($user->id, $data['name'], $data['scopes'], $data['ratePerMinute'] ?? null);
        return response()->json(['key' => $keys->payload($key), 'secret' => $secret], 201)->header('Cache-Control', 'no-store');
    }

    public function revokeKey(Request $request, string $id, ApiKeys $keys)
    {
        return response()->json(['key' => $keys->payload($keys->revoke($this->account($request, 'keys')->id, $id))]);
    }

    public function createWebhook(Request $request, WebhookEndpoints $hooks)
    {
        $user = $this->account($request, 'webhooks');
        $data = $request->validate(['url' => 'required|string|max:500', 'events' => 'required|array|min:1|max:4', 'events.*' => ['string', Rule::in(WebhookEndpoints::EVENTS)]]);
        [$endpoint, $secret] = $hooks->create($user->id, $data['url'], $data['events']);
        return response()->json(['webhook' => $hooks->payload($endpoint), 'secret' => $secret], 201)->header('Cache-Control', 'no-store');
    }

    public function pauseWebhook(Request $request, string $id, WebhookEndpoints $hooks)
    {
        $data = $request->validate(['paused' => 'required|boolean']);
        return response()->json(['webhook' => $hooks->payload($hooks->pause($this->account($request, 'webhooks')->id, $id, (bool) $data['paused']))]);
    }

    public function deleteWebhook(Request $request, string $id, WebhookEndpoints $hooks)
    {
        $hooks->delete($this->account($request, 'webhooks')->id, $id);
        return response()->json(['ok' => true]);
    }

    public function deliveries(Request $request, string $id, WebhookEndpoints $hooks)
    {
        return response()->json(['deliveries' => array_map(fn ($d) => $hooks->deliveryPayload($d), $hooks->deliveries($this->account($request, 'webhooks')->id, $id))]);
    }

    private function account(Request $request, ?string $needs = null)
    {
        $user = $request->user();
        if (!$user || $user->isGuest()) ApiError::throw(401, 'login_required', 'Please log in.');
        if (($needs === 'keys' && !ApiKeys::enabled()) || ($needs === 'webhooks' && !WebhookEndpoints::enabled()))
            ApiError::throw(404, 'not_available', 'This is not switched on.');
        return $user;
    }
}
