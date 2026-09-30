<?php
namespace App\Http\Controllers\CloudWorkspaces;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudWorkspaces\{Workspaces, Eligibility, Quotes, Start, Shutdown, Artifacts};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class WorkspaceController extends Controller
{
    use UserPayloads;
    public function index(Request $request, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        app(Wallet::class)->ensure($user);
        $eligible = true; $reason = null;
        try { app(Eligibility::class)->authorize($user->id, true); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $eligible = false; $reason = $e->getMessage(); }
        return $this->json(['ok' => true, 'enabled' => $eligible, 'reason' => $reason,
            'visible' => (bool) config('cloud_workspaces.ui_enabled') || DB::table('cloud_workspaces')->where('user_id', $user->id)->where('state', '!=', 'deleted')->exists(),
            'workspaces' => DB::table('cloud_workspaces')->where('user_id', $user->id)->where('state', '!=', 'deleted')->orderByDesc('created_at')->get()->map(fn ($w) => $workspaces->payload($w)),
            'limits' => ['projectBytes' => config('cloud_workspaces.max_project_bytes'), 'fileBytes' => config('cloud_workspaces.max_file_bytes'),
                'maxFiles' => config('cloud_workspaces.max_files'), 'maxSeconds' => config('cloud_workspaces.max_background_seconds')]]);
    }
    public function create(Request $request, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request); app(Wallet::class)->ensure($user);
        $data = $request->validate(['id' => 'required|uuid', 'name' => 'required|string|max:120', 'projectId' => 'required|string|max:150']);
        return $this->json(['ok' => true, 'workspace' => $workspaces->payload($workspaces->create($user->id, $data))]);
    }
    public function show(Request $request, string $workspace, Workspaces $workspaces)
    {
        return $this->json(['ok' => true, 'workspace' => $workspaces->payload($workspaces->owned($this->authenticatedUser($request)->id, $workspace))]);
    }
    public function import(Request $request, string $workspace, Workspaces $workspaces)
    {
        $data = $request->validate(['revision' => 'required|integer|min:0', 'consent' => 'required|accepted', 'files' => 'present|array']);
        return $this->json(['ok' => true, 'workspace' => $workspaces->payload($workspaces->import($this->authenticatedUser($request)->id, $workspace, $data['revision'], $data['files']))]);
    }
    public function quote(Request $request, string $workspace, Workspaces $workspaces, Quotes $quotes)
    {
        $session = $this->authenticatedSession($request);
        $data = $request->validate(['revision' => 'required|integer|min:0', 'deviceId' => 'required|uuid', 'model' => 'required|string|max:200',
            'budgetUnits' => 'required|integer|min:1|max:'.config('cloud_workspaces.max_budget_units'),
            'seconds' => 'required|integer|min:60|max:'.config('cloud_workspaces.max_background_seconds'), 'canWrite' => 'required|boolean',
            'commands' => 'present|array|max:10', 'commands.*' => 'required|string|max:500']);
        return $this->json(['ok' => true, 'quote' => $quotes->create($session, $workspaces->owned($session->user_id, $workspace), $data)]);
    }
    public function start(Request $request, string $workspace, Start $start)
    {
        $data = $request->validate(['quoteId' => 'required|uuid', 'proof' => 'required|string|max:64', 'consent' => 'required|boolean']);
        return $this->json(['ok' => true, ...$start->accept($this->authenticatedSession($request), $workspace, $data)], 202);
    }
    public function stop(Request $request, string $workspace, Shutdown $shutdown, Workspaces $workspaces)
    {
        $w = $shutdown->request($this->authenticatedUser($request)->id, $workspace);
        \App\Jobs\ReconcileCloudWorkspace::dispatch($workspace);
        return $this->json(['ok' => true, 'workspace' => $workspaces->payload($w)]);
    }
    public function export(Request $request, string $workspace, Workspaces $workspaces, Artifacts $artifacts)
    {
        $w = $workspaces->owned($this->authenticatedUser($request)->id, $workspace);
        abort_if($w->state === 'deleted', 410, 'This cloud project was deleted.');
        return $this->json(['ok' => true, 'workspace' => $workspaces->payload($w), 'base' => $artifacts->read($w, $w->base_checkpoint),
            'current' => $artifacts->read($w), 'savedAt' => $w->checkpoint_at, 'mayHaveUnsavedChanges' => (bool) $w->unsaved_possible]);
    }
    public function receipts(Request $request, string $workspace, Workspaces $workspaces)
    {
        $w = $workspaces->owned($this->authenticatedUser($request)->id, $workspace);
        $rows = DB::table('cloud_reservations')->where('workspace_id', $workspace)->orderByDesc('created_at')->limit(200)->get();
        return $this->json(['ok' => true, 'workspace' => $workspaces->payload($w), 'runtime' => $rows->map(fn ($r) => [
            'id' => $r->id, 'generation' => $r->generation, 'reservedUnits' => (string) $r->reserved, 'chargedUnits' => (string) $r->charged,
            'releasedUnits' => (string) ($r->settled_at ? $r->reserved - $r->charged : 0), 'tariffVersion' => $r->tariff_version,
            'unitsPerHour' => (string) $r->units_per_hour, 'billedSeconds' => $r->billed_seconds, 'meteredFrom' => $r->metered_from, 'meteredTo' => $r->metered_to,
            'providerEstimatedMicroUsd' => (string) $r->actual_micro_usd, 'settledAt' => $r->settled_at, 'createdAt' => $r->created_at]),
            'ai' => $w->chat_id ? DB::table('vibes_turns')->where('chat_id', $w->chat_id)->orderByDesc('created_at')->limit(100)->get()
                ->map(fn ($t) => ['id' => $t->id, 'model' => $t->model, 'reservedUnits' => (string) $t->reserved,
                    'chargedUnits' => (string) $t->charged, 'actualMicroUsd' => (string) $t->actual_micro_usd, 'settledAt' => $t->settled_at]) : []]);
    }
}
