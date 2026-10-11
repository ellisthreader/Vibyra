<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Services\AgentOrganizations\{Audit, Definitions, Instances, Overview, Policies};
use Illuminate\Http\Request;
final class OrganisationController extends Controller
{
    use V2Requests;
    public function index(Request $r) { return $this->json(Overview::get($this->v2User($r)->id)); }
    public function policy(Request $r)
    {
        $user = $this->v2User($r);
        $data = $r->validate(['expectedRevision' => 'required|integer|min:0', 'enabled' => 'required|boolean',
            'allowedProviders' => 'present|array|max:100', 'allowedProviders.*' => ['string', 'distinct', 'regex:/^[a-z][a-z0-9_]{0,79}$/D'],
            'dailyTaskLimit' => 'required|integer|between:1,1000', 'retentionDays' => 'required|integer|between:1,365']);
        return $this->json(['policy' => Policies::save($user->id, $data)]);
    }
    public function put(Request $r, string $id)
    {
        $user = $this->v2User($r);
        $data = $r->validate(['expectedRevision' => 'required|integer|min:0', 'name' => 'required|string|max:80',
            'avatar' => 'required|string|max:100', 'instructions' => 'required|string|max:8000', 'knowledge' => 'present|nullable|string|max:20000']);
        return $this->json(['definition' => Definitions::save($user->id, $id, $data)]);
    }
    public function destroy(Request $r, string $id)
    {
        $user = $this->v2User($r); $data = $r->validate(['expectedRevision' => 'required|integer|min:1']);
        return $this->json(['definition' => Definitions::retire($user->id, $id, (int) $data['expectedRevision'])]);
    }
    public function adopt(Request $r, string $id)
    {
        $user = $this->v2User($r); $data = $r->validate(['expectedRevision' => 'required|integer|min:1',
            'reviewHash' => ['required', 'regex:/^[a-f0-9]{64}$/D']]);
        return $this->json(Instances::adopt($user->id, $id, (int) $data['expectedRevision'], $data['reviewHash']));
    }
    public function audit(Request $r)
    {
        $user = $this->v2User($r); $data = $r->validate(['cursor' => 'sometimes|integer|min:1']);
        return $this->json(Audit::page($user->id, isset($data['cursor']) ? (int) $data['cursor'] : null));
    }
}
