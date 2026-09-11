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
        $user = $this->authenticatedUser($request);
        abort_unless(config('vibes.enabled'), 503);
        $d = $request->validate(['hostId' => 'required|string|max:150', 'projectId' => 'required|string|max:150',
            'binding' => 'required|uuid', 'shareProject' => 'required|accepted']);
        DB::transaction(function () use ($user, $chat, $d) {
            $w = app(Wallet::class)->lock($user->id);
            abort_unless($w->consented_at, 403, 'Allow AI processing before attaching a project.');
            DB::table('vibes_chats')->where('id', $chat)->where('user_id', $user->id)->firstOrFail();
            abort_if(DB::table('vibes_turns')->where('chat_id', $chat)->whereNull('settled_at')->exists(), 409, 'Wait for the active turn before changing projects.');
            // Count the distinct projects this account would hold after the change,
            // so moving one chat between projects never trips the plan limit.
            $entitled = $w->paid_until && now()->lt($w->paid_until) ? $w->plan : 'free';
            $max = app(Plans::class)->for($entitled)['maxProjects'];
            $after = DB::table('vibes_chats')->where('user_id', $user->id)->whereNot('id', $chat)
                ->whereNotNull('project_id')->get(['host_id', 'project_id'])
                ->map(fn ($c) => $c->host_id.'/'.$c->project_id)->push($d['hostId'].'/'.$d['projectId'])->unique();
            abort_if($max !== null && $after->count() > $max, 402,
                'Your plan includes '.$max.' '.($max === 1 ? 'project' : 'projects').'. Upgrade to use more.');
            DB::table('vibes_chats')->where('id', $chat)->update(['host_id' => $d['hostId'],
                'project_id' => $d['projectId'], 'binding' => $d['binding'], 'updated_at' => now(),
                'revision' => DB::raw('revision + 1')]);
        });
        return $this->json(['ok' => true]);
    }

    public function result(Request $request, string $tool, AgentTools $tools)
    {
        $user = $this->authenticatedUser($request);
        $d = $request->validate(['decision' => 'required|in:allow,decline', 'result' => 'required|array']);
        abort_if(strlen(json_encode($d['result'])) > 16000, 422, 'Tool output is too large.');
        $tools->respond($user->id, $tool, $d['decision'], $d['decision'] === 'decline' ? ['declined' => true] : $d['result']);
        return $this->json(['ok' => true]);
    }
}
