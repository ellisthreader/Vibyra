<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Agents\Workspaces;
use App\Services\Agents\BranchPublication\BranchDelivery;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class AgentWorkspacesController extends Controller
{
    use UserPayloads;

    public function index(Request $request)
    {
        $user = $this->authenticatedUser($request);
        return $this->json(['workspaces' => DB::table('agent_workspaces')->where('user_id', $user->id)
            ->whereNull('revoked_at')->get(['id', 'agent_id as agentId', 'host_id as hostId', 'label',
                'can_write as canWrite', 'can_test as canTest'])->all()]);
    }

    public function register(Request $request, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        abort_unless(config('agents.enabled') && config('agents.local_runner_enabled'), 503, 'Agent computer is not enabled.');
        abort_unless(app(\App\Services\Membership\PlanLimits::class)->allows($user, 'agents'), 402, AgentsController::AGENTS_NEED_PRO);
        $data = $request->validate(['agentId' => 'required|uuid', 'hostId' => ['required', 'regex:/^[a-f0-9]{64}$/'],
            'label' => 'required|string|max:80', 'platform' => 'sometimes|in:macos,linux,windows',
            'canWrite' => 'sometimes|boolean', 'canTest' => 'sometimes|boolean']);
        abort_if(trim($data['label']) === '', 422, 'Name this workspace.');
        return $this->json(['workspace' => $workspaces->register($user->id, $data['agentId'], $data['hostId'], $data['label'],
            (bool) ($data['canWrite'] ?? false), (bool) ($data['canTest'] ?? false), $data['platform'] ?? null)]);
    }

    public function revoke(Request $request, string $id, Workspaces $workspaces)
    {
        $workspaces->revoke($this->authenticatedUser($request)->id, $id);
        return $this->json(['ok' => true]);
    }

    public function pending(Request $request, string $id, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        abort_unless(config('agents.enabled') && config('agents.local_runner_enabled'), 503);
        $grant = $workspaces->authenticated($user->id, $id, $request->header('X-Vibyra-Runner-Key'));
        return $this->json(['tools' => $workspaces->pending($grant)]);
    }

    public function result(Request $request, string $id, string $tool, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        abort_unless(config('agents.enabled') && config('agents.local_runner_enabled'), 503);
        $grant = $workspaces->authenticated($user->id, $id, $request->header('X-Vibyra-Runner-Key'));
        $data = $request->validate(['result' => 'required|array']);
        $workspaces->respond($grant, $tool, $data['result']);
        return $this->json(['ok' => true]);
    }

    public function claim(Request $request, string $id, string $tool, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        abort_unless(config('agents.enabled') && config('agents.local_runner_enabled'), 503);
        $grant = $workspaces->authenticated($user->id, $id, $request->header('X-Vibyra-Runner-Key'));
        $data = $request->validate(['fingerprint' => ['required', 'regex:/^[a-f0-9]{64}$/']]);
        $workspaces->claim($grant, $tool, $data['fingerprint']);
        return $this->json(['ok' => true]);
    }

    public function publish(Request $request, string $id, string $tool, Workspaces $workspaces,
        BranchDelivery $delivery)
    {
        $user = $this->authenticatedUser($request);
        abort_unless(config('agents.enabled') && config('agents.local_runner_enabled')
            && config('agents.git_publish_enabled'), 503);
        abort_if((int) $request->header('Content-Length', 0) > 24 * 1024 * 1024,
            413, 'The publish upload exceeds its bound.');
        $grant = $workspaces->authenticated($user->id, $id, $request->header('X-Vibyra-Runner-Key'));
        $data = $request->validate(['snapshot' => 'required|array']);
        return $this->json(['result' => $delivery->submit($grant, $tool, $data['snapshot'])], 202);
    }
}
