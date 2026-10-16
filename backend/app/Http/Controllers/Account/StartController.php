<?php
namespace App\Http\Controllers\Account;

use App\Http\Controllers\{Controller, Concerns\UserPayloads};
use App\Services\Account\StartRoute;
use Illuminate\Http\Request;

/** docs/start-route-contract.md: where the phone starts. Read only here: linking a Mac (PUT/DELETE /api/account/macs) needs the `link-mac` proof, which this release does not carry. */
final class StartController extends Controller
{
    use UserPayloads;

    /** GET /api/account/start */
    public function show(Request $request, StartRoute $start)
    {
        return $this->json($start->for($this->authenticatedUser($request)))->header('Cache-Control', 'private, no-store');
    }
}
