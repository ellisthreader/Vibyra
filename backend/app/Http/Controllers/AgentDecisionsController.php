<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Agents\ToolActions;
use Illuminate\Http\Request;

class AgentDecisionsController extends Controller
{
    use UserPayloads;

    public function resolve(Request $request, string $id, ToolActions $actions)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['fingerprint' => 'required|string|size:64', 'decision' => 'required|in:allow,decline']);
        $actions->decide($user->id, $id, $data['fingerprint'], $data['decision']);
        return $this->json(['ok' => true]);
    }
}
