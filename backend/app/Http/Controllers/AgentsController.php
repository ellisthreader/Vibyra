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

    public const AGENTS_NEED_PRO = 'Agents are part of Vibyra Pro. Upgrade to create and run teammates.';

    public function index(Request $request, Teammates $agents)
    {
        $user = $this->authenticatedUser($request);
        // Teammates stay readable after Pro ends; only creating and running them needs Pro.
        return $this->json(['version' => 1, 'enabled' => (bool) config('agents.enabled'),
            'entitled' => app(\App\Services\Membership\PlanLimits::class)->allows($user, 'agents'),
            'capabilities' => ['cloudTasks' => true, 'cloudComputer' => false,
                'localComputer' => (bool) config('agents.local_runner_enabled'),
                'vmTests' => (bool) config('agents.local_runner_enabled') && (bool) config('agents.vm_tests_enabled'),
                'routines' => false, 'handoffs' => false],
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
        abort_unless(app(\App\Services\Membership\PlanLimits::class)->allows($user, 'agents'), 402, self::AGENTS_NEED_PRO);
        $data = $request->validate([
            'id' => $id ? 'prohibited' : 'required|uuid', 'revision' => $id ? 'required|integer|min:1' : 'prohibited',
            'name' => 'required|string|max:80', 'brief' => 'required|string|max:4000', 'memory' => 'present|nullable|string|max:4000',
            'avatar' => ['required', Rule::in(['site', 'review', 'oncall', 'assistant', 'lead', 'bugs', 'db', 'qa', 'sprout'])],
            'model' => 'sometimes|string|max:160', 'skillIds' => 'sometimes|array|max:20',
            'skillIds.*' => 'uuid|distinct',
            'budget' => 'required|integer|min:1|max:100', 'integrations' => 'present|array|max:500',
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
