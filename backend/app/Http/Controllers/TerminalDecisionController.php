<?php
namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Decisions\TerminalDecisions;
use Illuminate\Http\Request;

final class TerminalDecisionController extends Controller
{
    use UserPayloads;
    public function create(Request $request, TerminalDecisions $decisions)
    {
        $user = $this->authenticatedUser($request);
        $data = $request->validate(['id' => 'required|uuid', 'source' => 'required|in:accounts,vibyra',
            'text' => 'required|string|max:4000', 'consent' => 'required|accepted',
            'models' => 'required|array|min:1|max:64', 'models.*.id' => 'required|string|max:160|distinct',
            'models.*.name' => 'required|string|max:120', 'models.*.efforts' => 'present|array|max:8',
            'models.*.efforts.*' => 'string|in:none,minimal,low,medium,high,xhigh,max']);
        $result = $decisions->choose($user->id, $data);
        return response()->json(['ok' => true, 'selection' => $result])->header('Cache-Control', 'private, no-store');
    }
}
