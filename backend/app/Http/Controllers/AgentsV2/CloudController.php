<?php
namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\Cloud\{Accounts, Policies, Registration};
use App\Services\CloudComputer\Computers;
use App\Services\CloudWorkspaces\Runtime;
use Illuminate\Http\Request;

final class CloudController extends Controller
{
    use V2Requests;

    public function show(Request $r)
    {
        $user = $this->v2User($r)->id;
        return $this->json($this->payload($user));
    }

    public function quote(Request $r)
    {
        $this->v2User($r); app(Policies::class)->enabled();
        $d = $r->validate(['profile' => 'required|in:standard', 'deviceId' => 'required|string|min:1|max:128',
            'budgetUnits' => 'required|integer|min:1|max:'.config('cloud_workspaces.max_budget_units'),
            'deadlineSeconds' => 'required|integer|min:60|max:'.config('cloud_workspaces.max_background_seconds')]);
        return $this->json(['quote' => app(\App\Services\AgentRuns\Cloud\ComputeQuotes::class)->create($this->authenticatedSession($r), $d)]);
    }

    public function save(Request $r, Policies $policies)
    {
        $user = $this->v2User($r)->id;
        $d = $r->validate(['quoteId' => 'required|uuid', 'deviceId' => 'required|string|min:1|max:128',
            'provider' => 'required|in:claude', 'accountId' => ['required', 'regex:/^[A-Za-z0-9._-]{1,128}$/D'],
            'model' => 'required|string|min:1|max:120', 'effort' => 'sometimes|nullable|in:low,medium,high,xhigh,max',
            'expectedRevision' => 'required|integer|min:0', 'maxStarts' => 'required|integer|min:1|max:100',
            'totalBudgetUnits' => 'required|integer|min:1|max:100000000', 'totalSeconds' => 'required|integer|min:60|max:2592000',
            'expiresAt' => 'required|date|after:now|before_or_equal:'.now()->addDays(30)->toIso8601String()]);
        $policies->save($this->authenticatedSession($r), $d);
        return $this->json($this->payload($user));
    }

    public function revoke(Request $r, Policies $policies)
    {
        $user = $this->v2User($r)->id;
        $d = $r->validate(['expectedRevision' => 'required|integer|min:1']);
        $policies->revoke($user, $d['expectedRevision']);
        return $this->json($this->payload($user));
    }

    public function next(Request $r, string $workspace, Runtime $runtime, Registration $registration)
    {
        $w = $runtime->authenticate($workspace, (string) $r->bearerToken());
        return $runtime->withCurrent($w, function ($w) use ($registration) {
            $this->computer($w);
            return $this->json(['selection' => $registration->next($w)]);
        });
    }

    public function accounts(Request $r, string $workspace, Runtime $runtime, Accounts $accounts)
    {
        $d = $r->validate(['generation' => 'required|integer|min:1', 'accounts' => 'present|array|max:20',
            'accounts.*.provider' => 'required|in:claude', 'accounts.*.accountId' => ['required', 'regex:/^[A-Za-z0-9._-]{1,128}$/D'],
            'accounts.*.label' => 'required|string|min:1|max:120', 'accounts.*.authenticated' => 'required|boolean',
            'accounts.*.models' => 'present|array|max:50', 'accounts.*.models.*' => 'required|string|max:120',
            'accounts.*.efforts' => 'present|array|max:8', 'accounts.*.efforts.*' => 'required|in:low,medium,high,xhigh,max']);
        $w = $runtime->authenticate($workspace, (string) $r->bearerToken());
        return $runtime->withCurrent($w, function ($w) use ($d, $accounts) {
            $this->computer($w); abort_unless((int) $w->generation === $d['generation'], 409);
            $accounts->report($w, $d['accounts']);
            return $this->json(['ok' => true]);
        });
    }

    public function register(Request $r, string $workspace, Runtime $runtime, Registration $registration)
    {
        $d = $r->validate(['generation' => 'required|integer|min:1', 'runtimeId' => 'required|uuid',
            'provider' => 'required|in:claude', 'accountId' => 'required|string|max:128', 'model' => 'required|string|max:120',
            'effort' => 'sometimes|nullable|in:low,medium,high,xhigh,max', 'providerVersion' => 'sometimes|nullable|string|max:60',
            'capabilities.pinnedSkillsV1' => 'sometimes|boolean', 'capabilities.controlledTools' => 'required|accepted', 'capabilities.taskSteering' => 'required|accepted']);
        $w = $runtime->authenticate($workspace, (string) $r->bearerToken());
        return $runtime->withCurrent($w, function ($w) use ($d, $registration) {
            $this->computer($w);
            return $this->json($registration->register($w, $d));
        });
    }

    private function computer(object $w): void
    {
        abort_unless($w->kind === 'computer', 403);
        app(\App\Services\AgentRuns\Access::class)->require($w->user_id);
        app(Policies::class)->enabled();
    }

    private function payload(int $user): array
    {
        $computers = app(Computers::class);
        return [...app(Policies::class)->payload($user), 'accounts' => app(Accounts::class)->list($computers->find($user)),
            'computer' => $computers->payload($user)['computer']];
    }
}
