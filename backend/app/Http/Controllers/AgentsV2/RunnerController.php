<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Models\AgentV2\ToolAction;
use App\Services\AgentRuns\{ApiError, Leases, RunnerFlow, Runs};
use App\Services\AgentRuns\Tools\{Broker, Manifest};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Mac runner protocol: claim with a fenced lease, heartbeat, stream, call tools, finish. */
final class RunnerController extends Controller
{
    use V2Requests;

    public function claim(Request $request, string $runtime, Leases $leases, Runs $runs, Manifest $manifest)
    {
        $run = $leases->claim($this->runner($request, $runtime));
        if (!$run) return response('', 204);
        return $this->json(['run' => $runs->claimPayload($run, $manifest->for($run))]);
    }

    public function heartbeat(Request $request, string $runtime, string $run, Leases $leases)
    {
        $binding = $this->runner($request, $runtime);
        return $this->json($leases->heartbeat($binding, $run, $this->generation($request)));
    }

    public function events(Request $request, string $runtime, string $run, RunnerFlow $flow)
    {
        $binding = $this->runner($request, $runtime);
        $data = $request->validate(['generation' => 'required|integer|min:1', 'events' => 'required|array|min:1|max:50',
            'events.*.type' => 'required|in:'.implode(',', RunnerFlow::RUNNER_EVENTS),
            'events.*.text' => 'present|string|max:8000']);
        return $this->json(['eventCursor' => $flow->events($binding, $run, (int) $data['generation'],
            array_map(fn ($e) => ['type' => $e['type'], 'text' => $e['text']], $data['events']))]);
    }

    public function tools(Request $request, string $runtime, string $run, Leases $leases, Manifest $manifest)
    {
        $binding = $this->runner($request, $runtime);
        $row = DB::transaction(fn () => $leases->fenced($binding, $run, $this->generation($request)));
        return $this->json(['manifest' => $manifest->for($row)]);
    }

    public function call(Request $request, string $runtime, string $run, Broker $broker)
    {
        $binding = $this->runner($request, $runtime);
        $data = $request->validate(['generation' => 'required|integer|min:1',
            'callId' => ['required', 'string', 'regex:/^[A-Za-z0-9._:-]{1,100}$/D'], 'tool' => 'required|string|max:80',
            'connectionId' => 'required|uuid', 'schemaRevision' => 'required|string|max:20', 'arguments' => 'present|array']);
        if (strlen(json_encode($data['arguments'])) > 16000) ApiError::throw(422, 'arguments_too_large', 'Tool arguments are too large.');
        return $this->json(['action' => $broker->request($binding, $run, $data)]);
    }

    public function action(Request $request, string $runtime, string $run, string $action, Leases $leases, Broker $broker)
    {
        $binding = $this->runner($request, $runtime);
        $generation = $this->generation($request);
        $row = DB::transaction(function () use ($leases, $binding, $run, $generation, $action) {
            $leases->fenced($binding, $run, $generation, true);
            return ToolAction::query()->where('run_id', $run)->whereKey($action)->first();
        });
        if (!$row) ApiError::throw(404, 'action_not_found', 'That action does not exist.');
        return $this->json(['action' => $broker->outcome($row)]);
    }

    public function complete(Request $request, string $runtime, string $run, RunnerFlow $flow, Runs $runs)
    {
        $binding = $this->runner($request, $runtime);
        $data = $request->validate(['generation' => 'required|integer|min:1',
            'answer' => 'required|string']); // no length rule: RunnerFlow clips a long answer with a notice (F-05)
        if (trim($data['answer']) === '') ApiError::throw(422, 'empty_answer', 'A completed task needs its final answer.');
        return $this->json(['run' => $runs->payload($flow->complete($binding, $run, (int) $data['generation'], $data['answer']))]);
    }

    public function fail(Request $request, string $runtime, string $run, RunnerFlow $flow, Runs $runs)
    {
        $binding = $this->runner($request, $runtime);
        $data = $request->validate(['generation' => 'required|integer|min:1',
            'code' => 'required|in:provider_signin,limits,provider_error,step_limit,runner_error',
            'reason' => 'required|string|max:500', 'resumeAt' => 'nullable|date']);
        $resumeAt = isset($data['resumeAt']) ? \Illuminate\Support\Carbon::parse($data['resumeAt']) : null;
        return $this->json(['run' => $runs->payload($flow->fail($binding, $run, (int) $data['generation'], $data['code'], $data['reason'], $resumeAt))]);
    }

    private function generation(Request $request): int
    {
        $value = $request->input('generation', $request->query('generation'));
        if (!is_numeric($value) || (int) $value < 1) ApiError::throw(422, 'generation_required', 'Send the lease generation.');
        return (int) $value;
    }
}
