<?php

namespace App\Http\Controllers\Teams;

use App\Http\Controllers\Controller;
use App\Services\Teams\Sso\Settings;
use App\Services\Teams\{Overview, Teams};
use Illuminate\Http\Request;

/** The owner's SSO card: configure the issuer, verify the domain, switch it on, require it. Browser session, owner role only. */
final class TeamSsoController extends Controller
{
    public function save(Request $request, Settings $sso, Overview $overview)
    {
        $user = Teams::account($request->user());
        $sso->save($user, $request->validate(['issuer' => 'required|string|max:300', 'clientId' => 'required|string|max:200',
            'clientSecret' => 'nullable|string|max:2000', 'domain' => 'required|string|max:253']));
        return response()->json($overview->for($user));
    }

    public function verify(Request $request, Settings $sso, Overview $overview)
    {
        $user = Teams::account($request->user());
        $sso->verifyDomain($user);
        return response()->json($overview->for($user));
    }

    public function enable(Request $request, Settings $sso, Overview $overview)
    {
        $user = Teams::account($request->user());
        $data = $request->validate(['enabled' => 'required|boolean', 'requireSso' => 'sometimes|boolean']);
        $sso->enable($user, (bool) $data['enabled'], (bool) ($data['requireSso'] ?? false));
        return response()->json($overview->for($user));
    }

    public function remove(Request $request, Settings $sso, Overview $overview)
    {
        $user = Teams::account($request->user());
        $sso->remove($user);
        return response()->json($overview->for($user));
    }
}
