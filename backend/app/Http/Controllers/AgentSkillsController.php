<?php
namespace App\Http\Controllers;
use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Agents\Skills;
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
final class AgentSkillsController extends Controller
{
    use UserPayloads;
    public function index(Request $request, Skills $skills) { return $this->json(['skills' => $skills->list($this->authenticatedUser($request)->id)]); }
    public function save(Request $request, Skills $skills) {
        $user = $this->authenticatedUser($request); app(Wallet::class)->ensure($user);
        abort_unless(config('agents.enabled'), 503, 'Teammate tasks are paused.');
        $data = $request->validate(['id' => 'required|uuid', 'revision' => 'required|integer|min:0', 'name' => 'required|string|max:80',
            'instructions' => 'required|string|max:4000', 'teammateIds' => 'present|array|max:50', 'teammateIds.*' => 'uuid|distinct']);
        return $this->json(['skill' => $skills->save($user->id, $data)]);
    }
}
