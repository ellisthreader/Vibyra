<?php
namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Models\AgentV2\{Connection, Grant, Run};
use App\Services\AgentBrowser\PrivateHandoffs;
use App\Services\AgentRuns\Browser\{BrowserGrants, BrowserRuntimeScope};
use App\Services\AgentRuns\{RunStates};
use Illuminate\Http\Request;

final class PrivateBrowserController extends Controller
{
    use V2Requests;

    public function runs(Request $r, string $runtime)
    {
        $b = BrowserRuntimeScope::runner($r, $runtime);
        abort_unless(BrowserRuntimeScope::enabled($b), 409);
        $runs = Run::where('user_id', $b->user_id)->where('runtime_binding_id', $b->id)
            ->whereNotIn('state', RunStates::TERMINAL)->whereNull('cancel_requested_at')
            ->where('lease_expires_at', '>', now())->orderBy('created_at')->limit(3)->get();
        $rows = [];
        foreach ($runs as $run) foreach ($run->grant_snapshot ?? [] as $pinned) {
            $g = Grant::whereKey($pinned['grantId'] ?? '')->where('user_id', $b->user_id)->whereNull('revoked_at')->first();
            $c = $g ? Connection::whereKey($g->connection_id)->where('provider', 'browser')->whereNull('revoked_at')->first() : null;
            if (!$c || !BrowserGrants::usable($run, $c)) continue;
            $rows[] = ['id' => $run->id, 'generation' => $run->lease_generation,
                'browser' => ['connectionId' => $c->id, 'generation' => $c->generation, 'origins' => $c->scopes]];
            break;
        }
        return $this->privateJson(['runs' => $rows]);
    }

    public function begin(Request $r, string $runtime, string $run, string $action, PrivateHandoffs $handoffs)
    {
        $b = BrowserRuntimeScope::runner($r, $runtime);
        $d = $r->validate(['generation' => 'required|integer|min:1', 'origin' => 'required|string|max:300']);
        return $this->privateJson(['handoff' => $handoffs->begin($b, $run, $action, (int) $d['generation'], $d['origin'])]);
    }

    public function exchange(Request $r, string $runtime, string $id, PrivateHandoffs $handoffs)
    {
        $b = BrowserRuntimeScope::runner($r, $runtime);
        abort_if(strlen($r->getContent()) > 1450000, 413);
        $d = $r->validate(['generation' => 'required|integer|min:1', 'frameSequence' => 'required|integer|min:0',
            'acknowledgedSequence' => 'required|integer|min:0', 'frame' => 'sometimes|array']);
        foreach (['generation', 'frameSequence', 'acknowledgedSequence'] as $key) $d[$key] = (int) $d[$key];
        return $this->privateJson($handoffs->exchange($b, $id, $d));
    }

    public function abort(Request $r, string $runtime, string $id)
    {
        $b = BrowserRuntimeScope::runner($r, $runtime);
        $d = $r->validate(['generation' => 'required|integer|min:1']);
        $h = \App\Models\AgentV2\BrowserHandoff::whereKey($id)->where('user_id', $b->user_id)
            ->where('runtime_id', $b->id)->where('generation', $d['generation'])->first();
        if ($h) \App\Services\AgentBrowser\PrivateExpiry::end($h);
        return $this->privateJson(['ok' => true]);
    }

    public function index(Request $r, PrivateHandoffs $handoffs)
    {
        $this->v2User($r);
        return $this->privateJson(['handoffs' => $handoffs->list($this->authenticatedSession($r))]);
    }

    public function open(Request $r, string $id, PrivateHandoffs $handoffs)
    {
        $this->v2User($r);
        $d = $r->validate(['expectedRevision' => 'required|integer|min:1']);
        return $this->privateJson(['handoff' => $handoffs->open($this->authenticatedSession($r), $id, (int) $d['expectedRevision'])]);
    }

    public function frame(Request $r, string $id, PrivateHandoffs $handoffs)
    {
        $this->v2User($r);
        return $this->privateJson($handoffs->frame($this->authenticatedSession($r), $id));
    }

    public function input(Request $r, string $id, PrivateHandoffs $handoffs)
    {
        $this->v2User($r);
        abort_if(strlen($r->getContent()) > 12000, 413);
        $d = $r->validate(['expectedRevision' => 'required|integer|min:1', 'frameSequence' => 'required|integer|min:1',
            'sequence' => 'required|integer|min:1', 'command' => 'required|array']);
        foreach (['expectedRevision', 'frameSequence', 'sequence'] as $key) $d[$key] = (int) $d[$key];
        return $this->privateJson(['handoff' => $handoffs->input($this->authenticatedSession($r), $id, $d)]);
    }

    private function privateJson(array $payload)
    {
        return $this->json($payload)->header('Cache-Control', 'private, no-store')->header('Pragma', 'no-cache');
    }
}
