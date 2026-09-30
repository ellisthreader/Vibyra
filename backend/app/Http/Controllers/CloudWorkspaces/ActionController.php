<?php
namespace App\Http\Controllers\CloudWorkspaces;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudWorkspaces\{Access, Actions, Workspaces};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class ActionController extends Controller
{
    use UserPayloads;
    public function create(Request $request, string $workspace, Actions $actions, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['id' => 'required|uuid', 'operation' => 'required|string|max:40', 'arguments' => 'present|array']);
        $action = DB::transaction(function () use ($user, $workspace, $request, $data, $actions, $workspaces) {
            app(Wallet::class)->lock($user->id);
            $w = $workspaces->owned($user->id, $workspace);
            app(Access::class)->verify($request, $w);
            return $actions->create($w, $data['id'], $data['operation'], $data['arguments']);
        }, 5);
        return $this->json(['ok' => true, 'action' => $actions->payload($action)], 202);
    }
    public function show(Request $request, string $workspace, string $action, Actions $actions, Workspaces $workspaces)
    {
        $w = $workspaces->owned($this->authenticatedUser($request)->id, $workspace);
        app(Access::class)->verify($request, $w);
        return $this->json(['ok' => true, 'action' => $actions->payload(DB::table('cloud_actions')->where('id', $action)->where('workspace_id', $workspace)->firstOrFail())]);
    }
    public function cancel(Request $request, string $workspace, string $action, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        return DB::transaction(function () use ($user, $request, $workspace, $action, $workspaces) {
        app(Wallet::class)->lock($user->id);
        $w = $workspaces->owned($user->id, $workspace);
        app(Access::class)->verify($request, $w);
        DB::table('cloud_actions')->where('id', $action)->where('workspace_id', $workspace)->whereIn('state', ['queued', 'running'])
            ->update(['state' => 'cancelled', 'updated_at' => now()]);
        return $this->json(['ok' => true]);
        }, 5);
    }
}
