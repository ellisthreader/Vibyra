<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{Computers, SyncLogins};
use Illuminate\Http\Request;

/** Opt-in login carry-over, account side: the Mac uploads (or withdraws) one sealed Codex login. The body is never opened or logged. */
final class SyncLoginController extends Controller
{
    use UserPayloads, SyncGuards;

    public function put(Request $request, string $provider, SyncLogins $logins)
    {
        $user = $this->authenticatedUser($request)->id; $this->storing($user);
        $this->provider($provider);
        $q = $this->valid($request->query(), ['seq' => 'required|integer|min:1', 'sha256' => ['required', 'string', 'regex:/^[a-f0-9]{64}$/']]);
        [$stream, $declared] = $this->body($request);
        $logins->receive($user, $provider, (int) $q['seq'], $q['sha256'], $stream, $declared);
        return $this->reply($user, $logins);
    }

    public function delete(Request $request, string $provider, SyncLogins $logins)
    {
        $user = $this->authenticatedUser($request)->id; $this->eligible($user);
        $this->provider($provider);
        $logins->remove($user, $provider);
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
