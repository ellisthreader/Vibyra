<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Vibes\{AgentTools, Plans, Wallet};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VibesToolsController extends Controller
{
    use UserPayloads;

    public function attach(Request $request, string $chat)
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        abort_unless(config('vibes.enabled'), 503);
        $d = $request->validate(['hostId' => 'required|string|max:150', 'projectId' => 'required|string|max:150',
            'binding' => 'required|uuid', 'shareProject' => 'required|accepted']);
        DB::transaction(function () use ($user, $chat, $d) {
            $w = app(Wallet::class)->lock($user->id);
            abort_unless($w->consented_at, 403, 'Allow AI processing before attaching a project.');
            $session = DB::table('vibes_chats')->where('id', $chat)->where('user_id', $user->id)->firstOrFail();
            abort_if($session->terminal_model ?? null, 409, 'A terminal keeps its original project. Start a new terminal to change projects.');
            abort_if(DB::table('vibes_turns')->where('chat_id', $chat)->whereNull('settled_at')->exists(), 409, 'Wait for the active turn before changing projects.');
            // Count the distinct projects this account would hold after the change,
            // so moving one chat between projects never trips the plan limit.
            $entitled = app(Wallet::class)->planFor($user->id);
            $max = app(Plans::class)->for($entitled)['maxProjects'];
            $after = DB::table('vibes_chats')->where('user_id', $user->id)->whereNot('id', $chat)
                ->whereNotNull('project_id')->get(['host_id', 'project_id'])
                ->map(fn ($c) => $c->host_id.'/'.$c->project_id)->push($d['hostId'].'/'.$d['projectId'])->unique();
            $switchable = \App\Services\Membership\Units::modern($user->id) && in_array($entitled, ['free', 'pro_v2'], true);
            abort_if(!$switchable && $max !== null && $after->count() > $max, 402,
                'Your plan includes '.$max.' '.($max === 1 ? 'project' : 'projects').'. Upgrade to use more.');
            app(\App\Services\Membership\Projects::class)->activate($user->id, $d['hostId'], $d['projectId']);
            DB::table('vibes_chats')->where('id', $chat)->update(['host_id' => $d['hostId'],
                'project_id' => $d['projectId'], 'binding' => $d['binding'], 'updated_at' => now(),
                'revision' => DB::raw('revision + 1')]);
        });
        return $this->json(['ok' => true]);
    }

    public function detach(Request $request, string $chat)
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        DB::transaction(function () use ($user, $chat) {
            app(Wallet::class)->lock($user->id);
            $session = DB::table('vibes_chats')->where('id', $chat)->where('user_id', $user->id)->firstOrFail();
            abort_if($session->terminal_model ?? null, 409, 'A terminal keeps its original project. Start a new terminal to change projects.');
            abort_if(DB::table('vibes_turns')->where('chat_id', $chat)->whereNull('settled_at')->exists(), 409, 'Wait for the active turn before unlinking this project.');
            DB::table('vibes_chats')->where('id', $chat)->update(['host_id' => null, 'project_id' => null,
                'binding' => null, 'updated_at' => now(), 'revision' => DB::raw('revision + 1')]);
        });
        return $this->json(['ok' => true]);
    }

    public function result(Request $request, string $tool, AgentTools $tools)
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        $d = $request->validate(['decision' => 'required|in:allow,decline', 'result' => 'required|array']);
        abort_if(DB::table('vibes_tools')->where('id', $tool)->whereNotNull('integration')->exists(), 422, 'Connected service results are recorded by Vibyra.');
        abort_if(DB::table('vibes_tools')->where('id', $tool)->whereNotNull('agent_workspace_id')->exists(), 422, 'Computer results come from the granted computer.');
        abort_if(strlen(json_encode($d['result'])) > 16000, 422, 'Tool output is too large.');
        $tools->respond($user->id, $tool, $d['decision'], $d['decision'] === 'decline' ? ['declined' => true] : $d['result']);
        return $this->json(['ok' => true]);
    }
}
