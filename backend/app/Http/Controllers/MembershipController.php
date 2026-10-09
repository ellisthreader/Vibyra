<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\Membership\{Offers, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MembershipController extends Controller
{
    use UserPayloads;
    private function account(Request $r): \App\Models\User
    {
        return $r->is('web-api/*') ? ($r->user() ?? abort(401)) : $this->authenticatedUser($r);
    }
    public function snapshot(Request $r, Wallet $wallet)
    {
        $u = $this->account($r); $wallet->ensure($u);
        return response()->json(['wallet' => $wallet->payload($u->id)]);
    }
    public function order(Request $r, string $order)
    {
        $u = $this->account($r);
        $o = DB::table('membership_orders')->where('id', $order)->where('user_id', $u->id)->firstOrFail();
        return response()->json(['paid' => $o->fulfilled_at !== null]);
    }
    public function preflight(Request $r)
    {
        $u = $this->authenticatedUser($r);
        $d = $r->validate(['productId' => 'required|string|max:160']);
        $offer = app(Offers::class)->apple($d['productId']);
        if ($offer) {
            abort_unless(Units::modern($u->id) && app(\App\Services\Vibes\AppleEnvironment::class)->purchasesEnabled($u->id), 409, 'This offer is not available for your account.');
            abort_if($offer['kind'] === 'subscription' && app(\App\Services\Membership\Entitlements::class)->for($u)['tier'] !== 'free', 409, 'Manage your existing subscription before buying another.');
        }
        return response()->json(['ok' => true]);
    }
    public function activity(Request $r)
    {
        $u = $this->account($r);
        $d = $r->validate(['before' => 'sometimes|integer|min:1']);
        $rows = DB::table('vibes_ledger')->where('user_id', $u->id)
            ->when(isset($d['before']), fn ($q) => $q->where('id', '<', $d['before']))->orderByDesc('id')->limit(51)->get();
        return response()->json(['items' => $rows->take(50)->map(fn ($l) => ['id' => (string) $l->id,
            'kind' => $l->kind, 'deltaUnits' => (string) $l->delta, 'unitScale' => $l->unit_scale,
            'createdAt' => $l->created_at])->values(), 'next' => $rows->count() > 50 ? (string) $rows[49]->id : null]);
    }
}
