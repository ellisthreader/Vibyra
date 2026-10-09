<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Services\AgentCoordination\Workflows;
use Illuminate\Http\Request;
final class WorkflowsController extends Controller
{
    use V2Requests;
    public function index(Request $r, string $id, Workflows $workflows)
    {
        $d = $r->validate(['cursor' => 'sometimes|uuid', 'limit' => 'sometimes|integer|min:1|max:50']);
        return $this->json($workflows->page($this->v2User($r)->id, $id, $d['limit'] ?? 20, $d['cursor'] ?? null));
    }
    public function show(Request $r, string $id, Workflows $workflows)
    {
        return $this->json(['workflow' => $workflows->payload($workflows->find($this->v2User($r)->id, $id))]);
    }
    public function control(Request $r, string $id, Workflows $workflows)
    {
        $d = $r->validate(['revision' => 'required|integer|min:1', 'action' => 'required|in:pause,resume,cancel']);
        return $this->json(['workflow' => $workflows->control($this->v2User($r)->id, $id, $d['revision'], $d['action'])]);
    }
    public function confirm(Request $r, string $id, Workflows $workflows)
    {
        $d = $r->validate(['revision' => 'required|integer|min:1']);
        return $this->json(['workflow' => $workflows->confirm($this->v2User($r)->id, $id, $d['revision'])]);
    }
}
