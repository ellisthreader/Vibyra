<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Models\VibyraSession;
use App\Services\Remote\{RemoteAccessException, RemoteHostPolicy, RemoteSecurityRateLimit, RemoteSessionApproval};
use Illuminate\Http\{JsonResponse, Request};

class RemoteSecurityController extends Controller
{
    use UserPayloads;

    public function restrictions(Request $request, \App\Services\Remote\RemoteRestrictions $controls, string $hostId): JsonResponse
    {
        $app = $this->account($request);
        $data = $request->validate(['after' => 'sometimes|integer|min:0|max:9007199254740991', 'at' => 'sometimes|integer|min:0|max:9007199254740991']);
        return $this->attempt($request, $app, 'controls', $hostId, function () use ($controls, $app, $hostId, $data, $request) {
            $controls->rateLimit($app, $hostId, $request->ip());
            return ['control' => $controls->snapshot($app, $hostId, (int) ($data['after'] ?? 0), isset($data['at']) ? (int) $data['at'] : null)];
        }, false);
    }

    public function policy(Request $request, RemoteHostPolicy $policy, string $hostId): JsonResponse
    {
        $app = $this->account($request);
        return $this->attempt($request, $app, 'read', $hostId, fn () => ['security' => $policy->describe($policy->host($app, $hostId))], false);
    }

    public function policyChallenge(Request $request, RemoteHostPolicy $policy, string $hostId): JsonResponse
    {
        $app = $this->account($request); $data = $request->validate(['mode' => ['required', 'in:ask,trusted,disabled']]);
        return $this->attempt($request, $app, 'policy', $hostId, fn () => $policy->challenge($app, $hostId, $data['mode']));
    }

    public function changePolicy(Request $request, RemoteHostPolicy $policy, string $hostId): JsonResponse
    {
        $app = $this->account($request);
        $data = $request->validate(['mode' => ['required', 'in:ask,trusted,disabled'], 'challengeId' => ['nullable', 'uuid'], 'proof' => ['nullable', 'string', 'max:64']]);
        return $this->attempt($request, $app, 'policy', $hostId,
            fn () => ['security' => $policy->change($app, $hostId, $data['mode'], $data['challengeId'] ?? null, $data['proof'] ?? null)]);
    }

    public function disable(Request $request, RemoteHostPolicy $policy): JsonResponse
    {
        $app = $this->account($request);
        return $this->attempt($request, $app, 'disable', null, fn () => $policy->disableAll($app));
    }

    public function pending(Request $request, RemoteSessionApproval $approval, string $hostId): JsonResponse
    {
        $app = $this->account($request);
        return $this->attempt($request, $app, 'read', $hostId, fn () => ['sessions' => $approval->pending($app, $hostId)], false);
    }

    public function sessionChallenge(Request $request, RemoteSessionApproval $approval, string $hostId, string $id): JsonResponse
    {
        $app = $this->account($request); $data = $request->validate(['decision' => ['required', 'in:allow,deny']]);
        return $this->attempt($request, $app, 'session-decision', $hostId, fn () => $approval->challenge($app, $hostId, $id, $data['decision']));
    }

    public function decideSession(Request $request, RemoteSessionApproval $approval, string $hostId, string $id): JsonResponse
    {
        $app = $this->account($request);
        $data = $request->validate(['decision' => ['required', 'in:allow,deny'], 'challengeId' => ['required', 'uuid'], 'proof' => ['required', 'string', 'max:64']]);
        return $this->attempt($request, $app, 'session-decision', $hostId,
            fn () => $approval->decide($app, $hostId, $id, $data['decision'], $data['challengeId'], $data['proof']));
    }

    private function account(Request $request): VibyraSession
    {
        $this->authenticatedUser($request);
        return $this->authenticatedSession($request);
    }

    private function attempt(Request $request, VibyraSession $app, string $operation, ?string $device, callable $action, bool $limit = true): JsonResponse
    {
        try {
            if ($limit) app(RemoteSecurityRateLimit::class)->check($app, $operation, $device, $request->ip());
            return response()->json(['ok' => true] + $action())->header('Cache-Control', 'private, no-store');
        } catch (RemoteAccessException $error) {
            app(\App\Services\Remote\RemoteSecurityFailures::class)->rejected($app, $error, $device, $request->ip());
            return response()->json(['ok' => false, 'error' => $error->getMessage(), 'code' => $error->errorCode], $error->status)
                ->header('Cache-Control', 'private, no-store');
        }
    }
}
