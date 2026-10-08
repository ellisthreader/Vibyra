<?php

namespace App\Http\Controllers\AgentsV2;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\Drafts\Drafts;
use Illuminate\Http\Request;

final class DraftsController extends Controller
{
    use V2Requests;

    public function show(Request $request, string $id, Drafts $drafts)
    {
        return $this->json(['draft' => $drafts->payload($drafts->find($this->v2User($request)->id, $id))]);
    }

    public function update(Request $request, string $id, Drafts $drafts)
    {
        $user = $this->v2User($request);
        $data = $request->validate(['revision' => 'required|integer|min:1', 'fingerprint' => 'required|string|size:64',
            'arguments' => 'required|array:to,subject,body', 'connectionId' => 'sometimes|uuid',
            'attachmentIds' => 'sometimes|array|max:4', 'attachmentIds.*' => 'required|uuid|distinct']);
        return $this->json(['draft' => $drafts->payload($drafts->edit($user->id, $id, $data))]);
    }
}
