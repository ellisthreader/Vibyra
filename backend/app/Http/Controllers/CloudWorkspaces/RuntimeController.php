<?php
namespace App\Http\Controllers\CloudWorkspaces;

use App\Http\Controllers\Controller;
use App\Services\CloudWorkspaces\{Runtime, Tools};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class RuntimeController extends Controller
{
    public function bootstrap(Request $request, string $workspace, Runtime $runtime)
    {
        $data = $request->validate(['machineId' => 'required|string|max:80', 'generation' => 'required|integer|min:1']);
        return response()->json(['ok' => true, ...$runtime->bootstrap($workspace, (string) $request->bearerToken(), $data['machineId'], $data['generation'])]);
    }
    public function heartbeat(Request $request, string $workspace, Runtime $runtime)
    {
        $data = $request->validate(['ready' => 'required|boolean']);
        $w = $runtime->authenticate($workspace, (string) $request->bearerToken());
        $result = $runtime->heartbeat($w, $data['ready']);
        $cancelled = DB::table('cloud_actions')->where('workspace_id', $workspace)->where('generation', $w->generation)
            ->whereIn('state', ['cancelled', 'expired'])->where('claimed_at', '>=', now()->subMinutes(5))->pluck('id');
        return response()->json(['ok' => true, ...$result, 'cancelled' => $cancelled]);
    }
    public function checkpoint(Request $request, string $workspace, Runtime $runtime)
    {
        $data = $request->validate(['files' => 'present|array']);
        return response()->json(['ok' => true, ...$runtime->checkpoint($runtime->authenticate($workspace, (string) $request->bearerToken()), $data['files'])]);
    }
    public function next(Request $request, string $workspace, Runtime $runtime)
    {
        $w = $runtime->authenticate($workspace, (string) $request->bearerToken());
        // Retry the durable tool outbox, including results accepted before a worker crash.
        app(Tools::class)->drain($w);
        if ($w->chat_id) {
            foreach (DB::table('vibes_turns')->where('chat_id', $w->chat_id)->where('status', 'waiting')->whereNull('settled_at')->get() as $turn) app(Tools::class)->enqueue($turn->id);
            foreach (DB::table('cloud_actions')->where('workspace_id', $workspace)->where('state', 'completed')->whereNotNull('tool_id')->get() as $a) {
                if (DB::table('vibes_tools')->where('id', $a->tool_id)->whereNull('result')->exists()) app(Tools::class)->complete($a);
            }
        }
        $a = $runtime->claim($w);
        return response()->json(['ok' => true, 'action' => $a ? ['id' => $a->id, 'operation' => $a->operation,
            'arguments' => json_decode($a->arguments, true), 'generation' => $a->generation, 'expiresAt' => strtotime($a->expires_at.' UTC')] : null]);
    }
    public function result(Request $request, string $workspace, string $action, Runtime $runtime)
    {
        $data = $request->validate(['result' => 'present|array']);
        $w = $runtime->authenticate($workspace, (string) $request->bearerToken());
        $a = $runtime->result($w, $action, $data['result']);
        app(Tools::class)->complete($a);
        return response()->json(['ok' => true]);
    }
}
