<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\Controller;
use App\Services\CloudComputer\{AccessProviders, HostActivity, HostRegistration, Projects};
use App\Services\CloudWorkspaces\Runtime;
use App\Services\Remote\RemoteAccessException;
use Illuminate\Http\{JsonResponse, Request};

/** VM-facing cloud computer API. The runtime bearer names the workspace, so the owner is never taken from the request. */
final class RuntimeController extends Controller
{
    private const HOST = ['required', 'string', 'regex:/^[a-f0-9]{64}$/'];

    public function challenge(Request $request, string $workspace, HostRegistration $hosts)
    {
        $w = $this->computer($request, $workspace);
        $data = $request->validate(['hostId' => self::HOST]);
        return $this->attempt(fn () => app(Runtime::class)->withCurrent($w, fn ($current) => $hosts->challenge($current, $data['hostId'])))->header('Cache-Control', 'no-store');
    }

    public function register(Request $request, string $workspace, HostRegistration $hosts)
    {
        $w = $this->computer($request, $workspace);
        $data = $request->validate(['hostId' => self::HOST, 'name' => ['required', 'string', 'max:80'], 'platform' => ['nullable', 'string', 'max:32'],
            'version' => ['nullable', 'string', 'max:40'], 'challengeId' => ['required', 'uuid'], 'proof' => ['required', 'string', 'max:64'], 'wantTrusted' => ['sometimes', 'boolean']]);
        return $this->attempt(fn () => app(Runtime::class)->withCurrent($w, fn ($current) => $hosts->register($current, $data)))->header('Cache-Control', 'no-store');
    }

    public function activity(Request $request, string $workspace, HostActivity $activity)
    {
        $w = $this->computer($request, $workspace);
        $data = $request->validate(['running' => 'required|integer|min:0|max:50', 'waitingApproval' => 'required|integer|min:0|max:50', 'login' => 'sometimes|array',
            'login.claude' => 'sometimes|nullable|boolean', 'login.codex' => 'sometimes|nullable|boolean', 'projects' => 'sometimes|array|max:100',
            'providerPolicyVersion' => 'sometimes|integer|in:1']);
        app(Runtime::class)->withCurrent($w, fn ($current) => $activity->record($current, $data));
        return response()->json(['ok' => true, 'disabledProviders' => app(AccessProviders::class)->disabledProviders((int) $w->user_id)]);
    }

    public function pending(Request $request, string $workspace, Projects $projects)
    {
        return response()->json(['ok' => true, 'projects' => $projects->pending($this->computer($request, $workspace))]);
    }

    public function done(Request $request, string $workspace, string $id, Projects $projects)
    {
        $data = $request->validate(['ok' => 'sometimes|boolean', 'error' => 'sometimes|nullable|string|max:300']);
        $w = $this->computer($request, $workspace);
        app(Runtime::class)->withCurrent($w, fn ($current) => $projects->done($current, $id, (bool) ($data['ok'] ?? true), $data['error'] ?? null));
        return response()->json(['ok' => true]);
    }

    private function computer(Request $request, string $workspace): object
    {
        $w = app(Runtime::class)->authenticate($workspace, (string) $request->bearerToken());
        abort_unless(($w->kind ?? 'project') === 'computer', 403, 'This workspace is not a cloud computer.');
        return $w;
    }

    private function attempt(callable $operation): JsonResponse
    {
        try { return response()->json(['ok' => true] + $operation()); }
        catch (RemoteAccessException $refused) {
            return response()->json(array_filter(['ok' => false, 'error' => $refused->getMessage(), 'code' => $refused->errorCode], fn ($v) => $v !== null), $refused->status);
        }
    }
}
