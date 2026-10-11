<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Services\AgentBrowserWorkflows\{Tests, Workflows};
use Illuminate\Http\Request;
final class BrowserWorkflowsController extends Controller
{
    use V2Requests;
    private const EDIT = ['name' => 'required|string|min:1|max:100', 'steps' => 'required|array|min:1|max:16'];
    private const REVIEW = ['expectedRevision' => 'required|integer|min:1', 'reviewHash' => ['required', 'regex:/^[a-f0-9]{64}$/D']];
    public function index(Request $r, Workflows $w)
    {
        $u = $this->v2User($r); $d = $r->validate(['agentId' => 'sometimes|uuid']);
        return $this->json(['workflows' => $w->list($u->id, $d['agentId'] ?? null)]);
    }
    public function show(Request $r, string $id, Workflows $w) { return $this->json(['workflow' => $w->payload($w->find($this->v2User($r)->id, $id))]); }
    public function store(Request $r, Workflows $w)
    {
        $u = $this->v2User($r); $d = $r->validate(self::EDIT + ['id' => 'required|uuid', 'sourceRunId' => 'required|uuid']);
        return $this->json(['workflow' => $w->create($u->id, $d)], 201);
    }
    public function update(Request $r, string $id, Workflows $w)
    {
        $u = $this->v2User($r); $d = $r->validate(self::EDIT + ['expectedRevision' => 'required|integer|min:1']);
        $d['expectedRevision'] = (int) $d['expectedRevision']; return $this->json(['workflow' => $w->update($u->id, $id, $d)]);
    }
    public function test(Request $r, string $id, Tests $t)
    {
        $u = $this->v2User($r); $d = $r->validate(self::REVIEW + ['requestId' => 'required|uuid', 'inputs' => 'present|array|max:16']);
        $d['expectedRevision'] = (int) $d['expectedRevision']; return $this->json($t->start($u->id, $id, $d));
    }
    public function save(Request $r, string $id, Tests $t)
    {
        $u = $this->v2User($r); $d = $r->validate(self::REVIEW); $d['expectedRevision'] = (int) $d['expectedRevision'];
        return $this->json($t->save($u->id, $id, $d));
    }
}
