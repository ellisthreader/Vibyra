<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Models\RemoteAuditEvent;
use App\Services\Remote\RemoteAccess;
use App\Services\Remote\RemoteAccessException;
use App\Services\Remote\RemotePresence;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Remote access through Vibyra Cloud (`/api/remote/*`). A computer registers
 * itself here and takes a relay token; a phone lists the account's computers
 * and asks for a connection grant; the relay reports presence back. Terminal
 * traffic never comes through this API.
 */
class RemoteAccessController extends Controller
{
    use UserPayloads;

    private const HOST_ID = ['required', 'string', 'regex:/^[a-f0-9]{64}$/'];

    public function registerHost(Request $request, RemoteAccess $remote): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['hostId' => self::HOST_ID, 'name' => ['required', 'string', 'max:80'],
            'platform' => ['nullable', 'string', 'max:32'], 'version' => ['nullable', 'string', 'max:40'], 'challengeId' => ['nullable', 'uuid'], 'proof' => ['nullable', 'string', 'max:64']]);
        if (! $remote->availability($user)['live']) {
            return $this->json(['ok' => false, 'error' => 'Remote access is not available yet.'], 503);
        }

        return $this->attempt(fn () => $remote->register($user, $data['hostId'], trim($data['name']), $data['platform'] ?? null, $data['version'] ?? null, $this->authenticatedSession($request)->id, $data['challengeId'] ?? null, $data['proof'] ?? null));
    }

    public function challenge(Request $request, \App\Services\Remote\RemoteIdentityProof $proof): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['hostId' => self::HOST_ID, 'action' => ['required', 'in:register,transfer']]);
        return $this->attempt(fn () => $proof->challenge($user, $this->authenticatedSession($request)->id, $data['hostId'], $data['action']))
            ->header('Cache-Control', 'no-store');
    }

    public function hosts(Request $request, RemoteAccess $remote): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return $this->json(['ok' => true, 'computers' => $remote->computers($user)] + $remote->availability($user));
    }

    public function connect(Request $request, RemoteAccess $remote, string $hostId): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['clientName' => ['nullable', 'string', 'max:80']]);
        if (! preg_match('/^[a-f0-9]{64}$/', $hostId)) {
            return $this->json(['ok' => false, 'error' => 'That is not a computer identity.'], 422);
        }

        return $this->attempt(fn () => $remote->connect($user, $hostId, $data['clientName'] ?? null, $this->authenticatedSession($request)->id));
    }

    public function revoke(Request $request, RemoteAccess $remote, string $hostId): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return $this->json(['ok' => true, 'removed' => preg_match('/^[a-f0-9]{64}$/', $hostId) === 1 && $remote->revoke($user, $hostId),
            'disconnectPending' => \App\Models\RemoteHost::query()->where('host_id', $hostId)->where('user_id', $user->id)->exists()
                && app(\App\Services\Remote\RemoteRevocations::class)->pending($hostId)]);
    }

    /** The account's remote-access history: connections, never contents. */
    public function activity(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $events = RemoteAuditEvent::query()->where('user_id', $user->id)->orderByDesc('id')->limit(100)->get()
            ->map(fn (RemoteAuditEvent $event) => ['event' => $event->event, 'detail' => $event->detail ?? [],
                'at' => $event->created_at?->toIso8601String()])->all();

        return $this->json(['ok' => true, 'events' => $events]);
    }

    /** The relay's presence report, authenticated with the secret both share. */
    public function relayEvents(Request $request, RemotePresence $presence): JsonResponse
    {
        $secret = (string) config('remote.relay_report_secret', config('remote.relay_secret'));
        if (strlen($secret) < 32 || ! hash_equals($secret, (string) $request->bearerToken())) {
            return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }
        $data = $request->validate(['relayId' => ['nullable', 'string', 'max:80'], 'events' => ['required', 'array', 'max:500']]);
        $applied = $presence->ingest($data['relayId'] ?? 'relay', $data['events']);

        return $this->json(['ok' => true, 'applied' => $applied]);
    }

    public function authorizeRelay(Request $request, \App\Services\Remote\RelayAuthorization $authorization): JsonResponse
    {
        $secret = (string) config('remote.relay_report_secret', config('remote.relay_secret'));
        if (strlen($secret) < 32 || ! hash_equals($secret, (string) $request->bearerToken())) {
            return $this->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }
        $data = $request->validate(['token' => ['required', 'string', 'max:4096'], 'renewal' => ['sometimes', 'boolean']]);
        return $this->json(['ok' => true, 'allowed' => $authorization->allows($data['token'], (bool) ($data['renewal'] ?? false)), 'leaseSeconds' => 180]);
    }

    private function attempt(callable $operation): JsonResponse
    {
        try {
            return $this->json(['ok' => true] + $operation());
        } catch (RemoteAccessException $refused) {
            return $this->json(array_filter(['ok' => false, 'error' => $refused->getMessage(),
                'code' => $refused->errorCode], fn ($value) => $value !== null), $refused->status);
        }
    }
}
