<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Remote\{RemoteAccessException, RemoteDeviceProof};
use App\Services\Remote\Passkeys\PasskeyCeremonies;
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;

class RemotePasskeysController extends Controller
{
    use UserPayloads;

    public function begin(Request $request, PasskeyCeremonies $ceremonies): JsonResponse
    {
        $this->authenticatedUser($request);
        $session = $this->authenticatedSession($request);
        $data = $request->validate(['deviceId' => 'required|uuid', 'purpose' => 'required|in:register,authenticate',
            'challengeId' => 'required|uuid', 'proof' => 'required|string|max:64']);
        return $this->attempt(function () use ($data, $session, $ceremonies) {
            app(\App\Services\Remote\RemoteSecurityRateLimit::class)->check($session, 'passkey', $data['deviceId'], request()->ip());
            // Keep target-host/device locks until the ceremony exists, so a
            // concurrent security change cannot invalidate before its insertion.
            try {
                return DB::transaction(function () use ($data, $session, $ceremonies) {
                    $device = app(RemoteDeviceProof::class)->consume($session, $data['deviceId'], 'passkey', $data['challengeId'], $data['proof']);
                    return $ceremonies->begin($session, $device->id, $data['purpose']);
                });
            } catch (RemoteAccessException $error) {
                app(\App\Services\Remote\RemoteSecurityFailures::class)->rejected($session, $error, $data['deviceId'], request()->ip());
                throw $error;
            }
        });
    }

    public function options(Request $request, PasskeyCeremonies $ceremonies): JsonResponse
    {
        $data = $request->validate(['id' => 'required|uuid', 'secret' => 'required|string|size:43']);
        return $this->attempt(fn () => $ceremonies->options($data['id'], $data['secret']));
    }

    public function finish(Request $request, PasskeyCeremonies $ceremonies): JsonResponse
    {
        $data = $request->validate(['id' => 'required|uuid', 'secret' => 'required|string|size:43',
            'credential' => 'required|array']);
        if (strlen(json_encode($data['credential'])) > 32768) return $this->json(['ok' => false, 'error' => 'Verification response is too large.'], 422);
        return $this->attempt(function () use ($data, $ceremonies) {
            $ceremonies->finish($data['id'], $data['secret'], $data['credential']);
            return [];
        });
    }

    public function status(Request $request, string $id, PasskeyCeremonies $ceremonies): JsonResponse
    {
        $this->authenticatedUser($request);
        return $this->attempt(fn () => $ceremonies->status($this->authenticatedSession($request), $id));
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $keys = DB::table('passkey_credentials')->where('user_id', $user->id)->whereNull('revoked_at')
            ->get(['id', 'device_name', 'created_at', 'last_used_at']);
        return $this->json(['ok' => true, 'passkeys' => $keys])->header('Cache-Control', 'no-store');
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        return $this->attempt(function () use ($user, $id) {
            $id = filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => PHP_INT_MAX]]);
            if ($id === false) throw new RemoteAccessException('That passkey is not available.', 404);
            DB::transaction(function () use ($user, $id): void {
                \App\Models\RemoteHost::where('user_id', $user->id)->orderBy('id')->lockForUpdate()->get();
                $key = DB::table('passkey_credentials')->where('id', $id)->where('user_id', $user->id)->lockForUpdate()->first();
                if (! $key) throw new RemoteAccessException('That passkey is not available.', 404);
                if ($key->revoked_at) return;
                DB::table('passkey_credentials')->where('id', $key->id)->update(['revoked_at' => now(), 'updated_at' => now()]);
                app(\App\Services\Remote\RemoteAccountSecurity::class)->revoke($user->id, null, 'passkey_removed');
                app(\App\Services\Remote\SecurityEvents::class)->record($user->id, 'PASSKEY_REMOVED');
            });
            return [];
        });
    }

    private function attempt(callable $work): JsonResponse
    {
        try { return $this->json(['ok' => true] + $work())->header('Cache-Control', 'no-store'); }
        catch (RemoteAccessException $error) {
            return $this->json(['ok' => false, 'error' => $error->getMessage(), 'code' => $error->errorCode], $error->status)
                ->header('Cache-Control', 'no-store');
        }
    }
}
