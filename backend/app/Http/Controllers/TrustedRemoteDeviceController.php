<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Models\{TrustedDevice, VibyraSession};
use App\Services\Remote\{RemoteAccessException, RemoteDeviceProof, RemoteSecurityRateLimit, RemoteTrustedDevices};
use Illuminate\Http\{JsonResponse, Request};

class TrustedRemoteDeviceController extends Controller
{
    use UserPayloads;

    public function register(Request $request, RemoteTrustedDevices $devices): JsonResponse
    {
        $session = $this->account($request);
        $data = $request->validate(['hostId' => ['required', 'regex:/^[a-f0-9]{64}$/'], 'publicKey' => ['required', 'regex:/^[a-f0-9]{64}$/'],
            'deviceName' => ['required', 'string', 'max:80'], 'platform' => ['nullable', 'string', 'max:32'],
            'permissions' => ['sometimes', 'array', 'max:10'], 'permissions.*' => ['string']]);
        return $this->attempt($request, $session, 'register', $data['publicKey'], fn () => ['device' => $devices->describe($devices->register($session, $data, $request->ip()))]);
    }

    public function index(Request $request, RemoteTrustedDevices $devices): JsonResponse
    {
        $session = $this->account($request);
        $items = TrustedDevice::where('user_id', $session->user_id)->with('host')->orderByDesc('id')->limit(100)->get();
        return $this->reply(['devices' => $items->map(fn ($device) => $devices->describe($device))->all()]);
    }

    public function show(Request $request, RemoteTrustedDevices $devices, string $id): JsonResponse
    {
        $session = $this->account($request);
        $device = TrustedDevice::where('user_id', $session->user_id)->where('uuid', $id)->first();
        return $device ? $this->reply(['device' => $devices->describe($device)]) : $this->reply(['error' => 'That device is not available.'], 404);
    }

    public function challenge(Request $request, RemoteDeviceProof $proof, string $id): JsonResponse
    {
        $session = $this->account($request);
        $data = $request->validate(['purpose' => ['required', 'in:connect,passkey'], 'permissions' => ['sometimes', 'array', 'max:10'], 'permissions.*' => ['string']]);
        return $this->attempt($request, $session, 'challenge', $id, fn () => $proof->challenge($session, $id, $data['purpose'], $data['permissions'] ?? []));
    }

    public function face(Request $request, \App\Services\Remote\RemoteVisit $visits, RemoteTrustedDevices $devices, string $id): JsonResponse
    {
        $session = $this->account($request);
        $data = $request->validate(['face' => ['required', 'array'], 'face.id' => ['required', 'uuid'], 'face.proof' => ['required', 'string', 'max:64']]);
        return $this->attempt($request, $session, 'face', $id, fn () => ['device' => $devices->describe($visits->confirmWithFace($session, $id, $data['face']))]);
    }

    public function pending(Request $request, RemoteTrustedDevices $devices, string $hostId): JsonResponse
    {
        $session = $this->account($request);
        return $this->attempt($request, $session, 'pending', $hostId, fn () => ['devices' => $devices->pending($session, $hostId)], false);
    }

    public function decisionChallenge(Request $request, RemoteTrustedDevices $devices, string $hostId, string $id): JsonResponse
    {
        $session = $this->account($request);
        $data = $request->validate(['decision' => ['required', 'in:approve,deny']]);
        return $this->attempt($request, $session, 'decision', $id, fn () => $devices->decisionChallenge($session, $hostId, $id, $data['decision']));
    }

    public function decide(Request $request, RemoteTrustedDevices $devices, string $hostId, string $id): JsonResponse
    {
        $session = $this->account($request);
        $data = $request->validate(['decision' => ['required', 'in:approve,deny'], 'challengeId' => ['nullable', 'uuid'], 'proof' => ['nullable', 'string', 'max:64'],
            'assertionId' => ['nullable', 'uuid'], 'face' => ['nullable', 'array'], 'face.id' => ['required_with:face', 'uuid'], 'face.proof' => ['required_with:face', 'string', 'max:64']]);
        return $this->attempt($request, $session, 'decision', $id, function () use ($devices, $session, $hostId, $id, $data) {
            $cloud = \App\Models\RemoteHost::where('host_id', $hostId)->where('user_id', $session->user_id)->whereNull('revoked_at')->first();
            if (! $cloud) throw new RemoteAccessException('That computer is not available.', 404);
            if (app(\App\Services\CloudComputer\HostAuthority::class)->bound($cloud)) {
                // No Mac exists to approve: a fresh passkey assertion (ceremony id) decides, never a host proof.
                $approvals = app(\App\Services\CloudComputer\DevicePasskeyApproval::class);
                if ($data['decision'] === 'approve' && isset($data['face'])) {
                    return ['device' => $devices->describe(app(\App\Services\CloudComputer\DeviceFaceApproval::class)->approve($session, $hostId, $id, $data['face']))];
                }
                return ['device' => $devices->describe($data['decision'] === 'approve'
                    ? $approvals->approve($session, $hostId, $id, (string) ($data['assertionId'] ?? ''))
                    : $approvals->deny($session, $hostId, $id))];
            }
            if (! isset($data['challengeId'], $data['proof'])) throw new RemoteAccessException('Verify this device on its computer.', 422);
            return ['device' => $devices->describe($devices->decide($session, $hostId, $id, $data['decision'], $data['challengeId'], $data['proof']))];
        });
    }

    public function destroy(Request $request, RemoteTrustedDevices $devices, string $id): JsonResponse
    {
        $session = $this->account($request);
        return $this->attempt($request, $session, 'revoke', $id, fn () => ['device' => $devices->describe($devices->revoke($session, $id))]);
    }

    public function destroyAll(Request $request, RemoteTrustedDevices $devices): JsonResponse
    {
        $session = $this->account($request);
        return $this->attempt($request, $session, 'revoke-all', null, fn () => ['revoked' => $devices->revokeAll($session)]);
    }

    private function account(Request $request): VibyraSession
    {
        $this->authenticatedUser($request);
        return $this->authenticatedSession($request);
    }

    private function attempt(Request $request, VibyraSession $session, string $operation, ?string $device, callable $action, bool $limit = true): JsonResponse
    {
        try {
            if ($limit) app(RemoteSecurityRateLimit::class)->check($session, $operation, $device, $request->ip());
            return $this->reply($action());
        } catch (RemoteAccessException $error) {
            app(\App\Services\Remote\RemoteSecurityFailures::class)->rejected($session, $error, $device, $request->ip());
            return $this->reply(['error' => $error->getMessage(), 'code' => $error->errorCode], $error->status);
        }
    }

    private function reply(array $data, int $status = 200): JsonResponse
    {
        return response()->json(['ok' => $status < 400] + $data, $status)->header('Cache-Control', 'private, no-store');
    }
}
