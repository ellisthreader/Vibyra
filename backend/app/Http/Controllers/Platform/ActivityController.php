<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Http\Controllers\Controller;
use App\Services\AgentRuns\ApiError;
use App\Services\Platform\AccountActivity;
use Illuminate\Http\Request;

/** Read-only account activity: `/web-api/account/activity` (browser session) and `/api/account/activity` (app session, desktop). */
final class ActivityController extends Controller
{
    use UserPayloads;

    public function web(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->isGuest()) ApiError::throw(401, 'login_required', 'Please log in.');
        return $this->page($request, $user->id);
    }

    public function app(Request $request)
    {
        return $this->page($request, $this->authenticatedUser($request)->id);
    }

    private function page(Request $request, int $userId)
    {
        if (!config('platform.activity')) ApiError::throw(404, 'not_available', 'Account activity is not switched on.');
        $data = $request->validate(['limit' => 'sometimes|integer|min:1|max:100', 'before' => 'sometimes|integer|min:1']);
        return response()->json(['ok' => true, ...AccountActivity::list($userId, (int) ($data['limit'] ?? 30), $data['before'] ?? null)]);
    }
}
