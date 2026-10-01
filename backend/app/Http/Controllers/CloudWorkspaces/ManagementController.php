<?php
namespace App\Http\Controllers\CloudWorkspaces;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudWorkspaces\{Access, DeviceAuthorization, Workspaces, Eligibility};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class ManagementController extends Controller
{
    use UserPayloads;
    public function preview(Request $request, string $workspace, Workspaces $workspaces)
    {
        $d = $request->validate(['port' => 'required|integer|min:1024|max:65535', 'consent' => 'required|accepted']);
        $user = $this->authenticatedUser($request);
        return DB::transaction(function () use ($user, $request, $workspace, $d, $workspaces) {
            app(Wallet::class)->lock($user->id);
            return $this->json(['ok' => true, ...app(\App\Services\CloudWorkspaces\Preview::class)->ticket($request, $workspaces->ownedProject($user->id, $workspace), $d['port'])]);
        }, 5);
    }
    public function access(Request $request, string $workspace, Workspaces $workspaces)
    {
        $session = $this->authenticatedSession($request);
        $data = $request->validate(['deviceId' => 'required|uuid', 'challengeId' => 'sometimes|uuid', 'proof' => 'sometimes|string|max:64']);
        return DB::transaction(function () use ($session, $workspace, $data, $workspaces) {
            app(Wallet::class)->lock($session->user_id);
            $w = $workspaces->ownedProject($session->user_id, $workspace);
            abort_if($w->state === 'deleted', 410);
            $purpose = DeviceAuthorization::purpose('access', $workspace.':'.$w->generation);
            if (!isset($data['proof'], $data['challengeId'])) return $this->json(['ok' => true, 'challenge' => app(DeviceAuthorization::class)->challenge($session, $data['deviceId'], $purpose)]);
            $device = app(DeviceAuthorization::class)->consume($session, $data['deviceId'], $data['challengeId'], $data['proof'], $purpose);
            return $this->json(['ok' => true, 'access' => app(Access::class)->issue($w, $session, $device)]);
        }, 5);
    }
    public function budget(Request $request, string $workspace, Workspaces $workspaces)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['id' => 'required|uuid', 'revision' => 'required|integer|min:0',
            'budgetUnits' => 'required|integer|min:1|max:'.config('cloud_workspaces.max_budget_units'), 'consent' => 'required|accepted']);
        $w = DB::transaction(function () use ($user, $workspace, $request, $data, $workspaces) {
            app(Wallet::class)->lock($user->id);
            app(Eligibility::class)->authorize($user->id);
            $w = $workspaces->ownedProject($user->id, $workspace);
            app(Access::class)->verify($request, $w);
            $reference = 'cloud-budget:'.$data['id'];
            $old = DB::table('vibes_ledger')->where('user_id', $user->id)->where('reference', $reference)->first();
            if ($old) {
                $meta = json_decode($old->metadata, true);
                abort_unless($meta['workspaceId'] === $workspace && $meta['budgetUnits'] == $data['budgetUnits'], 409, 'This budget request ID was already used.');
                return $w;
            }
            abort_unless($w->revision == $data['revision'] && $data['budgetUnits'] > $w->budget_units, 409, 'Refresh the budget before increasing it.');
            DB::table('cloud_workspaces')->where('id', $workspace)->update(['budget_units' => $data['budgetUnits'], 'revision' => $w->revision + 1]);
            DB::table('vibes_chats')->where('id', $w->chat_id)->update(['terminal_budget_micro' => $data['budgetUnits']]);
            app(Wallet::class)->record($user->id, $reference, 'cloud_budget', 0, ['workspaceId' => $workspace, 'budgetUnits' => (string) $data['budgetUnits']]);
            return $workspaces->ownedProject($user->id, $workspace);
        }, 5);
        return $this->json(['ok' => true, 'workspace' => $workspaces->payload($w)]);
    }
    public function delete(Request $request, string $workspace, Workspaces $workspaces)
    {
        $request->validate(['confirmed' => 'required|accepted']);
        $w = $workspaces->ownedProject($this->authenticatedUser($request)->id, $workspace);
        app(\App\Services\CloudWorkspaces\Deletion::class)->delete($w);
        return $this->json(['ok' => true]);
    }
}
