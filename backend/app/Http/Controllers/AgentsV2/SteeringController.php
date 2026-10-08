<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\{ApiError, Runs, Steering};
use Illuminate\Http\Request;

final class SteeringController extends Controller
{
    use V2Requests;

    public function store(Request $request, string $id, Steering $steering, Runs $runs)
    {
        $user = $this->v2User($request);
        $input = $request->validate(['idempotencyKey' => 'required|uuid', 'expectedRevision' => 'required|integer|min:0',
            'text' => 'required|string|max:8000']);
        if (trim($input['text']) === '') ApiError::throw(422, 'instruction_empty', 'Enter your updated instruction.');
        return $this->json(['run' => $runs->payload($steering->submit($user->id, $id, $input))]);
    }

    public function checkpoint(Request $request, string $runtime, string $run, Steering $steering)
    {
        $binding = $this->runner($request, $runtime);
        $input = $request->validate(['generation' => 'required|integer|min:1']);
        $row = $steering->checkpoint($binding, $run, (int) $input['generation']);
        return $this->json(['instructionRevision' => $row->instruction_revision]);
    }
}
