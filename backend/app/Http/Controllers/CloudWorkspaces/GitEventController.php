<?php
namespace App\Http\Controllers\CloudWorkspaces;

use App\Http\Controllers\Controller;
use App\Services\CloudWorkspaces\Git\CloudEvents;
use App\Services\CloudWorkspaces\Runtime;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class GitEventController extends Controller
{
    public function create(Request $request, string $workspace, Runtime $runtime, CloudEvents $events)
    {
        $w = $runtime->authenticate($workspace, (string) $request->bearerToken());
        $data = $request->validate(['type' => ['required', Rule::in(array_diff(array_keys(CloudEvents::TYPES), ['retention.warning']))],
            'title' => 'required|string|max:500', 'body' => 'nullable|string|max:2000',
            'sessionId' => ['sometimes', 'nullable', 'string', 'max:100', 'regex:/^[A-Za-z0-9._:-]+$/']]);
        $result = $events->send($w, $data['type'], $data['title'], $data['body'] ?? '', $data['sessionId'] ?? null);
        return response()->json(['ok' => true, ...$result], 202);
    }
}
