<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Agents\Teammates;
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AgentsController extends Controller
{
    use UserPayloads;

    public function index(Request $request, Teammates $agents)
    {
        $user = $this->authenticatedUser($request);
        return $this->json(['version' => 1, 'enabled' => (bool) config('agents.enabled'),
            'capabilities' => ['cloudTasks' => true, 'cloudComputer' => false,
                'localComputer' => (bool) config('agents.local_runner_enabled'), 'routines' => false, 'handoffs' => false],
            'teammates' => app(\App\Services\Agents\RosterProjection::class)->list($user->id)]);
    }

    public function read(Request $request, string $id)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['cursor' => 'required|string|size:64']);
        app(\App\Services\Agents\RosterProjection::class)->read($user->id, $id, $data['cursor']);
        return $this->json(['ok' => true]);
    }

    public function save(Request $request, Teammates $agents, ?string $id = null)
    {
        $user = $this->authenticatedUser($request);
        abort_unless(config('agents.enabled'), 503, 'Teammates are being prepared. Please try again later.');
        app(Wallet::class)->ensure($user);
        $data = $request->validate([
            'id' => $id ? 'prohibited' : 'required|uuid', 'revision' => $id ? 'required|integer|min:1' : 'prohibited',
            'name' => 'required|string|max:80', 'brief' => 'required|string|max:4000', 'memory' => 'present|nullable|string|max:4000',
            'avatar' => ['required', Rule::in(['site', 'review', 'oncall', 'assistant', 'lead', 'bugs', 'db', 'qa', 'sprout'])],
            'model' => 'sometimes|string|max:160', 'skillIds' => 'sometimes|array|max:20',
            'skillIds.*' => 'uuid|distinct',
            'budget' => 'required|integer|min:1|max:50', 'integrations' => 'present|array|max:3',
            'integrations.*' => ['string', 'distinct', Rule::in(app(\App\Services\ChatConnectors\Registry::class)->slugs())],
        ]);
        return $this->json(['teammate' => $agents->save($user->id, $data, $id)]);
    }

    public function archive(Request $request, string $id, Teammates $agents)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['archived' => 'required|boolean', 'revision' => 'required|integer|min:1']);
        return $this->json(['teammate' => $agents->archive($user->id, $id, $data['archived'], $data['revision'])]);
    }

    public function chat(Request $request, string $id, Teammates $agents)
    {
        $a = $agents->get($this->authenticatedUser($request)->id, $id);
        return $this->json(['chats' => [DB::table('vibes_chats')->where('id', $a->chat_id)->firstOrFail()]]);
    }
}
