<?php

namespace App\Http\Controllers;

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

    public function start(Request $request, string $provider): JsonResponse
    {
        try {
            $flow = $this->flows->start(strtolower($provider), [
                'deviceName' => 'Vibyra Website',
                'installId' => 'website:'.$request->session()->getId(),
                'publicIp' => (string) $request->ip(),
            ]);
        } catch (ProviderIdentityException $error) {
            return response()->json(['ok' => false, 'error' => $error->getMessage()], 422);
        }

        return response()->json(['ok' => true, ...$flow]);
    }

    public function status(Request $request, string $provider, string $flowId): JsonResponse
    {
        $result = $this->flows->status(strtolower($provider), $flowId);
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

        return response()->json([
            'ok' => true,
            'status' => 'complete',
            'isNewUser' => (bool) ($result['isNewUser'] ?? false),
            'user' => $this->payload->for($user),
        ]);
    }
}
