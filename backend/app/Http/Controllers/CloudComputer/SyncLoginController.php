<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{Computers, SyncLogins};
use Illuminate\Http\Request;

/** Logins for Vibyra Cloud, account side: the Mac uploads (or withdraws) one sealed login per provider. The body is never opened or logged. */
final class SyncLoginController extends Controller
{
    use UserPayloads, SyncGuards;

    public function put(Request $request, string $provider, SyncLogins $logins)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $this->provider($provider);
        $q = $this->valid($request->query(), ['seq' => 'required|integer|min:1', 'sha256' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/'],
            'origin' => ['nullable', 'string', 'in:'.implode(',', SyncLogins::ORIGINS)]]);
        [$stream, $declared] = $this->body($request);
        $logins->receive($user, $provider, (int) $q['seq'], $q['sha256'], $stream, $declared, $q['origin'] ?? null);
        app(\App\Services\CloudComputer\Wake::class)->afterUpload($user);
        return $this->reply($user, $logins);
    }

    public function delete(Request $request, string $provider, SyncLogins $logins)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        $this->provider($provider);
        $q = $this->valid($request->query(), ['expectedSeq' => 'sometimes|integer|min:0']);
        $logins->remove($user, $provider, isset($q['expectedSeq']) ? (int) $q['expectedSeq'] : null);
        return $this->reply($user, $logins);
    }

    private function provider(string $provider): void
    {
        if (!in_array($provider, SyncLogins::PROVIDERS, true)) Computers::fail('invalid_request', 'That login cannot be carried over.', 422);
    }

    private function reply(int $user, SyncLogins $logins)
    {
        return response()->json(['ok' => true, 'logins' => $logins->payload($user)])->header('Cache-Control', 'private, no-store');
    }
}
