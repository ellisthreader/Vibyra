<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Services\AgentCoordination\{Groups, Planning};
use Illuminate\Http\Request;
final class GroupsController extends Controller
{
    use V2Requests;
    public function index(Request $r, Groups $groups) { return $this->json(['groups' => $groups->list($this->v2User($r)->id, $r->boolean('includeArchived'))]); }
    public function show(Request $r, string $id, Groups $groups) { return $this->json(['group' => $groups->payload($groups->find($this->v2User($r)->id, $id))]); }
    public function save(Request $r, string $id, Groups $groups) { return $this->json(['group' => $groups->save($this->v2User($r)->id, $id, $r->all())]); }
    public function delete(Request $r, string $id, Groups $groups)
    {
        $d = $r->validate(['expectedRevision' => 'required|integer|min:1']);
        return $this->json(['group' => $groups->delete($this->v2User($r)->id, $id, $d['expectedRevision'])]);
    }
    public function messages(Request $r, string $id, Planning $planning)
    {
        $d = $r->validate(['key' => 'sometimes|string|max:120']);
        return $this->json(['messages' => $planning->list($this->v2User($r)->id, $id, $d['key'] ?? null)]);
    }
    public function send(Request $r, string $id, Planning $planning) { return $this->json($planning->send($this->v2User($r)->id, $id, $r->all())); }
}
