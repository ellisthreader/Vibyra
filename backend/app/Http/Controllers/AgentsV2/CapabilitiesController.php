<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Models\AgentV2\Connection;
use App\Services\AgentCapabilities\{Catalogue, Installations};
use Illuminate\Http\Request;
final class CapabilitiesController extends Controller
{
    use V2Requests;
    public function show(Request $r, string $id, Catalogue $catalogue, Installations $installations)
    {
        $user = $this->v2User($r); $data = $r->validate(['connectionId' => 'sometimes|uuid']);
        $c = isset($data['connectionId']) ? Connection::query()->where('user_id', $user->id)->findOrFail($data['connectionId']) : null;
        return $this->json(['capability' => $catalogue->get($id, $c),
            'installations' => $installations->list($user->id, $id, $c?->id)]);
    }
    public function put(Request $r, string $id, Installations $installations)
    {
        $user = $this->v2User($r);
        $data = $r->validate(['connectionId' => 'required|uuid', 'expectedConnectionGeneration' => 'required|integer|min:1',
            'expectedRevision' => 'required|integer|min:0', 'version' => 'required|string|max:64', 'reviewHash' => ['required', 'regex:/^[a-f0-9]{64}$/D']]);
        $data['expectedRevision'] = (int) $data['expectedRevision'];
        $data['expectedConnectionGeneration'] = (int) $data['expectedConnectionGeneration'];
        return $this->json(['installation' => $installations->install($user->id, $id, $data)]);
    }
    public function destroy(Request $r, string $id, Installations $installations)
    {
        $user = $this->v2User($r);
        $data = $r->validate(['connectionId' => 'required|uuid', 'expectedRevision' => 'required|integer|min:1']);
        $data['expectedRevision'] = (int) $data['expectedRevision'];
        return $this->json(['installation' => $installations->revoke($user->id, $id, $data)]);
    }
}
