<?php

namespace App\Http\Controllers;

use App\Services\Analytics\Recorder;
use App\Services\Analytics\AuthLoginRecorder;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\SessionAuthenticator;
use App\Services\WebsiteAccountPayload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WebsiteProviderAuthController extends Controller
{
    public function __construct(
        private readonly DesktopProviderOAuthFlow $flows,
        private readonly SessionAuthenticator $sessions,
        private readonly WebsiteAccountPayload $payload,
    ) {}

    public function providers(): JsonResponse
    {
        return response()->json(['ok' => true, 'providers' => [
            'google' => $this->flows->isConfigured('google'),
            'apple' => $this->flows->isConfigured('apple'),
            'microsoft' => $this->flows->isConfigured('microsoft'),
        ]]);
    }

    public function start(Request $request, string $provider): JsonResponse
    {
        try {
            $flow = $this->flows->start(strtolower($provider), [
                'deviceName' => 'Vibyra Website',
                'installId' => 'website:'.$request->session()->getId(),
                'publicIp' => (string) $request->ip(),
            ], $this->flowBinding($request), app(\App\Services\Legal\TrustedClientIp::class)->forOAuthRequest($request), $request->attributes->get('license_hash'));
        } catch (ProviderIdentityException $error) {
            return response()->json(['ok' => false, 'error' => $error->getMessage()], 422);
        }

        return response()->json(['ok' => true, ...$flow]);
    }

    public function status(Request $request, string $provider, string $flowId): JsonResponse
    {
        if ($this->flows->isEnrollment($flowId)) {
            return response()->json(['ok' => false, 'error' => 'This verification belongs to an account session.'], 403);
        }
        $result = $this->flows->status(strtolower($provider), $flowId, $this->flowBinding($request));
        if (($result['status'] ?? null) === 'forbidden') {
            return response()->json($result, 403);
        }
        if (($result['status'] ?? null) !== 'complete') {
            return response()->json($result, ($result['status'] ?? null) === 'expired' ? 410 : 200);
        }

        $token = trim((string) ($result['token'] ?? ''));
        $authenticated = $this->sessions->authenticate($token, [
            'ip_address' => (string) $request->ip(),
            'user_agent' => (string) $request->userAgent(),
        ]);
        $session = $authenticated['session'] ?? null;
        $user = $session?->user;
        $expectedUserId = (int) ($result['user']['id'] ?? 0);
        if (! $user || $expectedUserId < 1 || (int) $user->id !== $expectedUserId) {
            $session?->delete();
            return response()->json(['ok' => false, 'status' => 'failed', 'error' => 'The provider sign-in could not be verified.'], 401);
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $session->delete();
        app(AuthLoginRecorder::class)->record($user, 'website', strtolower($provider));
        if (($result['isNewUser'] ?? false) === true) {
            app(Recorder::class)->signup($request);
        }

        return response()->json([
            'ok' => true,
            'status' => 'complete',
            'isNewUser' => (bool) ($result['isNewUser'] ?? false),
            'user' => $this->payload->for($user),
        ]);
    }

    // The browser that started a sign-in keeps a random key in its session;
    // only that browser can collect the result.
    private function flowBinding(Request $request): string
    {
        $key = (string) $request->session()->get('provider_flow_binding', '');
        if (strlen($key) < 40) {
            $key = \Illuminate\Support\Str::random(48);
            $request->session()->put('provider_flow_binding', $key);
        }

        return 'website:'.$key;
    }
}
