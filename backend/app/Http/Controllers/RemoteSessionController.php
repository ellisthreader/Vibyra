<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Remote\{RemoteAccessException, RemoteSessionManagement};
use Illuminate\Http\{JsonResponse, Request};

class RemoteSessionController extends Controller
{
    use UserPayloads;

    public function index(Request $request, RemoteSessionManagement $sessions): JsonResponse
    {
        return $this->privateResponse(['sessions' => $sessions->sessions($this->authenticatedUser($request))]);
    }

    public function show(Request $request, RemoteSessionManagement $sessions, string $id): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        return $this->attempt(fn () => ['session' => $sessions->find($user, $id)]);
    }

    public function destroy(Request $request, RemoteSessionManagement $sessions, string $id): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        return $this->attempt(fn () => $sessions->revoke($user, $id));
    }

    public function token(Request $request, \App\Services\Remote\RemoteSessionCreation $sessions, string $id): JsonResponse
    {
        $user = $this->authenticatedUser($request); $session = $this->authenticatedSession($request);
        $data = $request->validate(['deviceId' => ['required', 'uuid'], 'challengeId' => ['required', 'uuid'],
            'proof' => ['required', 'string', 'max:64'], 'permissions' => ['required', 'array', 'min:1', 'max:10'], 'permissions.*' => ['string']]);
        return $this->attempt(function () use ($request, $sessions, $session, $user, $id, $data) {
            app(\App\Services\Remote\RemoteSecurityRateLimit::class)->check($session, 'connect', $data['deviceId'], $request->ip());
            return $sessions->token($user, $session->id, $id, $data);
        }, $session, $data['deviceId']);
    }

    private function attempt(callable $operation, ?\App\Models\VibyraSession $session = null, ?string $device = null): JsonResponse
    {
        try { return $this->privateResponse($operation()); }
        catch (RemoteAccessException $error) {
            if ($session) app(\App\Services\Remote\RemoteSecurityFailures::class)->rejected($session, $error, $device, request()->ip());
            return response()->json(['ok' => false, 'error' => $error->getMessage()], $error->status)
                ->header('Cache-Control', 'private, no-store');
        }
    }

    private function privateResponse(array $payload): JsonResponse
    {
        return response()->json(['ok' => true] + $payload)->header('Cache-Control', 'private, no-store');
    }
}
