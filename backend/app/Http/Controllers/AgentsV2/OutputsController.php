<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\Outputs\{OutputExport, Outputs};
use Illuminate\Http\Request;

final class OutputsController extends Controller
{
    use V2Requests;

    public function index(Request $request, string $id, Outputs $outputs)
    {
        return $this->json(['outputs' => $outputs->list($this->v2User($request)->id, $id)]);
    }

    public function show(Request $request, string $id, Outputs $outputs)
    {
        return $this->json(['output' => $outputs->payload($outputs->find($this->v2User($request)->id, $id))]);
    }

    public function update(Request $request, string $id, Outputs $outputs)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['revision' => 'required|integer|min:1', 'title' => 'required|string|max:160',
            'content' => 'required|array']);
        return $this->json(['output' => $outputs->payload($outputs->edit($user->id, $id, $data))]);
    }

    public function export(Request $request, string $id, Outputs $outputs, OutputExport $export)
    {
        $output = $outputs->find($this->v2User($request)->id, $id);
        $data = $request->validate(['format' => 'sometimes|in:json,markdown']);
        return $this->json(['export' => $export->make($output, $data['format'] ?? 'markdown')]);
    }
}
