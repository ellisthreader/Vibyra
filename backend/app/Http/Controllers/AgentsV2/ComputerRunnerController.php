<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Computer\ComputerActions;
use Illuminate\Http\Request;

/** The leased Mac's computer actions: list, claim (authority rechecked), receipt. Fenced by generation. */
final class ComputerRunnerController extends Controller
{
    use V2Requests;

    public function index(Request $request, string $runtime, string $run, ComputerActions $actions)
    {
        $binding = $this->runner($request, $runtime);
        return $this->json(['actions' => $actions->pending($binding, $run, $this->generation($request))]);
    }

    public function claim(Request $request, string $runtime, string $run, string $action, ComputerActions $actions)
    {
        $binding = $this->runner($request, $runtime);
        $data = $request->validate(['generation' => 'required|integer|min:1', 'fingerprint' => ['required', 'regex:/^[a-f0-9]{64}$/D']]);
        return $this->json(['action' => $actions->claim($binding, $run, $action, (int) $data['generation'], $data['fingerprint'])]);
    }

    public function receipt(Request $request, string $runtime, string $run, string $action, ComputerActions $actions)
    {
        $binding = $this->runner($request, $runtime);
        abort_if(max((int) $request->header('Content-Length', 0), strlen($request->getContent())) > 24 * 1024 * 1024, 413, 'The receipt exceeds its bound.');
        $data = $request->validate(['generation' => 'required|integer|min:1', 'result' => 'required|array']);
        return $this->json(['action' => $actions->receipt($binding, $run, $action, (int) $data['generation'], $data['result'])]);
    }

    private function generation(Request $request): int
    {
        $value = $request->input('generation', $request->query('generation'));
        if (!is_numeric($value) || (int) $value < 1) ApiError::throw(422, 'generation_required', 'Send the lease generation.');
        return (int) $value;
    }
}
