<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{Computers, ConnectConsent, EnsureComputer, Projects, Wake};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;

/** Phone/Mac-facing cloud computer API (bearer session): state S, create, wake, stop, projects. */
final class ComputerController extends Controller
{
    use UserPayloads;

    public function show(Request $request, Computers $computers)
    {
        $user = $this->authenticatedUser($request);
        app(Wallet::class)->ensure($user);
        // Nothing cloud happens until the phone's "Connect to cloud" agreement; after it, an entitled account just has one.
        if (app(ConnectConsent::class)->connected($user->id)) app(EnsureComputer::class)->ensure($user->id);
        return $this->state($user->id, $computers);
    }

    public function create(Request $request, Computers $computers)
    {
        $user = $this->authenticatedUser($request); app(Wallet::class)->ensure($user);
        if (!app(ConnectConsent::class)->connected($user->id)) Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
        $data = $request->validate(['id' => 'required|uuid', 'name' => 'sometimes|nullable|string|max:120']);
        $computers->create($user->id, $data['id'], isset($data['name']) ? trim($data['name']) : null);
        return $this->state($user->id, $computers);
    }

    public function wake(Request $request, Computers $computers, Wake $wake)
    {
        $session = $this->authenticatedSession($request); $this->authenticatedUser($request);
        $data = $request->validate(['acceptTerms' => 'sometimes|boolean', 'deadlineSeconds' => 'sometimes|integer|min:60|max:'.config('cloud_workspaces.max_background_seconds')]);
        $wake->wake($session, $data);
        return $this->state($session->user_id, $computers, 202);
    }

    public function stop(Request $request, Computers $computers, Wake $wake)
    {
        $user = $this->authenticatedUser($request);
        $wake->stop($user->id);
        return $this->state($user->id, $computers);
    }

    public function projects(Request $request, Computers $computers, Projects $projects)
    {
        $user = $this->authenticatedUser($request);
        if (!app(ConnectConsent::class)->connected($user->id)) Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
        $data = $request->validate(['name' => ['required', 'string', 'regex:'.Projects::NAME],
            'repo' => ['sometimes', 'nullable', 'string', 'max:200', 'regex:~^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$~', 'not_regex:~(^|/)\.{1,2}(/|$)~'],
            'branch' => ['sometimes', 'nullable', 'string', 'max:200', 'regex:~^(?!-)[A-Za-z0-9._/-]+$~', 'not_regex:~\.\.~']]);
        $w = $computers->find($user->id);
        if (!$w) Computers::fail('computer_missing', 'Create your cloud computer first.', 404);
        return $this->json(['ok' => true, 'project' => $projects->queue($w, $data['name'], $data['repo'] ?? null, $data['branch'] ?? null)]);
    }

    private function state(int $user, Computers $computers, int $status = 200)
    {
        return $this->json(['ok' => true] + $computers->payload($user), $status)->header('Cache-Control', 'private, no-store');
    }
}
