<?php

namespace App\Http\Controllers\Teams;

use App\Http\Controllers\Controller;
use App\Services\AgentRuns\ApiError;
use App\Services\Teams\{Invitations, MemberCaps, Organizations, Overview, Roles, SeatBilling, Teams};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The portal's Team page, browser session only (never a bearer token or an API key). Every action authorizes against the caller's
 * own membership, never against an organization id taken from the request, so one team can never reach another. Bodies are
 * validated field by field; nothing from a request is mass-assigned.
 */
final class TeamController extends Controller
{
    public function show(Request $request, Overview $overview)
    {
        return response()->json($overview->for(Teams::account($request->user())))->header('Cache-Control', 'private, no-store');
    }

    public function create(Request $request, Organizations $orgs, Overview $overview)
    {
        $user = Teams::account($request->user());
        if (!Teams::mayCreate($user)) ApiError::throw(402, 'plan_required', 'Teams needs a plan that includes it.');
        $orgs->create($user, $request->validate(['name' => 'required|string|max:200'])['name']);
        return response()->json($overview->for($user), 201);
    }

    public function rename(Request $request, Organizations $orgs, Overview $overview)
    {
        $user = Teams::account($request->user());
        $orgs->rename(Teams::authorize($user, 'rename'), $request->validate(['name' => 'required|string|max:200'])['name']);
        return response()->json($overview->for($user));
    }

    public function leave(Request $request, Organizations $orgs, SeatBilling $seats)
    {
        $user = Teams::account($request->user());
        $org = Teams::membership($user)->organization_id;
        $orgs->leave($user);
        $seats->syncIfEnabled($org);
        return response()->json(['ok' => true]);
    }

    public function remove(Request $request, int $id, Organizations $orgs, Overview $overview, SeatBilling $seats)
    {
        $user = Teams::account($request->user());
        $org = Teams::membership($user)->organization_id;
        $orgs->remove($user, $id);
        $seats->syncIfEnabled($org);
        return response()->json($overview->for($user));
    }

    public function role(Request $request, int $id, Organizations $orgs, Overview $overview)
    {
        $user = Teams::account($request->user());
        $orgs->changeRole($user, $id, $request->validate(['role' => ['required', 'string', Rule::in(Roles::ALL)]])['role']);
        return response()->json($overview->for($user));
    }

    public function transfer(Request $request, Organizations $orgs, Overview $overview)
    {
        $user = Teams::account($request->user());
        $orgs->transfer($user, (int) $request->validate(['memberId' => 'required|integer|min:1'])['memberId']);
        return response()->json($overview->for($user));
    }

    /** The team's default monthly cap per member; `tokens: null` switches it off. */
    public function defaultCap(Request $request, MemberCaps $caps, Overview $overview)
    {
        $user = Teams::account($request->user());
        if (!config('teams.member_caps_enabled')) ApiError::throw(409, 'caps_unavailable', 'Team token limits are not available.');
        $caps->setDefault($user, $request->validate(['tokens' => 'present|nullable|numeric'])['tokens'] === null ? null : (float) $request->input('tokens'));
        return response()->json($overview->for($user));
    }

    public function memberCap(Request $request, int $id, MemberCaps $caps, Overview $overview)
    {
        $user = Teams::account($request->user());
        if (!config('teams.member_caps_enabled')) ApiError::throw(409, 'caps_unavailable', 'Team token limits are not available.');
        $caps->setMember($user, $id, $request->validate(['tokens' => 'present|nullable|numeric'])['tokens'] === null ? null : (float) $request->input('tokens'));
        return response()->json($overview->for($user));
    }

    public function invite(Request $request, Invitations $invites, Overview $overview, SeatBilling $seats)
    {
        $user = Teams::account($request->user());
        $data = $request->validate(['email' => 'required|string|max:254', 'role' => ['sometimes', 'string', Rule::in([Roles::ADMIN, Roles::MEMBER])]]);
        $invite = $invites->invite($user, $data['email'], $data['role'] ?? Roles::MEMBER);
        $seats->syncIfEnabled($invite->organization_id);
        return response()->json($overview->for($user), 201);
    }

    public function revoke(Request $request, string $id, Invitations $invites, Overview $overview)
    {
        $user = Teams::account($request->user());
        $invites->revoke($user, $id);
        return response()->json($overview->for($user));
    }

    /** What the invitation link is for, shown to the signed-in person before they accept. */
    public function preview(Request $request, Invitations $invites)
    {
        Teams::account($request->user());
        return response()->json(['ok' => true, ...$invites->preview($request->validate(['token' => 'required|string|max:80'])['token'])]);
    }

    public function accept(Request $request, Invitations $invites, Overview $overview, SeatBilling $seats)
    {
        $user = Teams::account($request->user());
        $m = $invites->accept($user, $request->validate(['token' => 'required|string|max:80'])['token']);
        $seats->syncIfEnabled($m->organization_id);
        return response()->json($overview->for($user));
    }
}
