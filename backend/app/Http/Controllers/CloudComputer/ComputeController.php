<?php
namespace App\Http\Controllers\CloudComputer;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\CloudComputer\{ComputeQuotes, ComputeUsage, PreviewActivity, PreviewTrial};
use Illuminate\Http\Request;

final class ComputeController extends Controller
{
    use UserPayloads;
    public function quote(Request $r, ComputeQuotes $quotes)
    {
        $s = $this->authenticatedSession($r); $this->authenticatedUser($r);
        $d = $r->validate(['profile' => 'required|in:standard,desktop,power', 'deviceId' => 'required|string|min:1|max:128',
            'budgetUnits' => 'required|integer|min:1|max:'.config('cloud_workspaces.max_budget_units'),
            'deadlineSeconds' => 'sometimes|integer|min:60|max:'.config('cloud_workspaces.max_background_seconds')]);
        return $this->json(['ok' => true, 'quote' => $quotes->create($s, $d)])->header('Cache-Control', 'private, no-store');
    }
    public function trial(Request $r, PreviewTrial $trial)
    {
        $u = $this->authenticatedUser($r);
        $d = $r->validate(['deviceToken' => 'required|string|min:16|max:4096']);
        return $this->json(['ok' => true] + $trial->claim($u->id, $d['deviceToken']))->header('Cache-Control', 'private, no-store');
    }
    public function activity(Request $r, PreviewActivity $activity)
    {
        $s = $this->authenticatedSession($r); $this->authenticatedUser($r);
        $d = $r->validate(['workspaceId' => 'required|uuid', 'generation' => 'required|integer|min:1',
            'visible' => 'required|boolean']);
        return $this->json(['ok' => true] + $activity->renew($s, $d))->header('Cache-Control', 'private, no-store');
    }
    public function usage(Request $r, ComputeUsage $usage)
    {
        $u = $this->authenticatedUser($r);
        $d = $r->validate(['before' => 'sometimes|string|max:256']);
        return $this->json(['ok' => true] + $usage->payload($u->id, $d['before'] ?? null))->header('Cache-Control', 'private, no-store');
    }
}
