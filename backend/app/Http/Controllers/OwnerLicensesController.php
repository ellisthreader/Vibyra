<?php

namespace App\Http\Controllers;

use App\Services\Membership\Licenses\Issuance;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class OwnerLicensesController extends Controller
{
    public function index(Request $r)
    {
        $d = $r->validate(['page' => 'sometimes|integer|min:1|max:100000', 'search' => 'nullable|string|max:120']);
        $query = DB::table('membership_licenses as l')->leftJoin('users as u', 'u.id', '=', 'l.user_id')
            ->select('l.id', 'l.label', 'l.key_suffix', 'l.tokens', 'l.allowance', 'l.duration_months', 'l.fixed_ends_at',
                'l.claim_by', 'l.redeemed_at', 'l.ends_at', 'l.revoked_at', 'l.created_at', 'u.email as redeemed_email');
        if ($d['search'] ?? '') {
            $search = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $d['search']);
            $query->where(fn ($q) => $q->where('l.label', 'like', '%'.$search.'%')->orWhere('u.email', 'like', '%'.$search.'%'));
        }
        $rows = $query->orderByDesc('l.created_at')->orderBy('l.id')->paginate(25);
        return response()->json(['ok' => true, 'licenses' => $rows->items(), 'page' => $rows->currentPage(),
            'lastPage' => $rows->lastPage(), 'enabled' => (bool) config('licenses.enabled')])->header('Cache-Control', 'private, no-store');
    }

    public function store(Request $r, Issuance $issuer)
    {
        $d = $r->validate([
            'request_id' => 'required|uuid', 'label' => 'required|string|max:120',
            'tokens' => 'required|integer|min:0|max:'.config('licenses.max_tokens'),
            'allowance' => 'required|in:once,monthly',
            'duration_months' => 'nullable|required_without:fixed_ends_at|integer|min:1|max:'.config('licenses.max_months'),
            'fixed_ends_at' => 'nullable|required_without:duration_months|date|after:now',
            'claim_by' => 'required|date|after:now',
        ]);
        abort_if(!empty($d['duration_months']) && !empty($d['fixed_ends_at']), 422, 'Choose a duration or a fixed end date, not both.');
        foreach (['claim_by', 'fixed_ends_at'] as $field) {
            if (empty($d[$field])) { $d[$field] = null; continue; }
            $date = Carbon::parse($d[$field])->utc();
            abort_if($date->gt(now()->addMonthsNoOverflow(config('licenses.max_months'))), 422, 'License deadlines must be within 36 months.');
            $d[$field] = $date->format('Y-m-d H:i:s');
        }
        abort_if($d['fixed_ends_at'] && $d['claim_by'] > $d['fixed_ends_at'], 422, 'The claim deadline cannot be after the license ends.');
        $d['duration_months'] = isset($d['duration_months']) ? (int) $d['duration_months'] : null;
        $d['tokens'] = (int) $d['tokens'];
        return response()->json(['ok' => true, ...$issuer->create($r->user(), $d)], 201)->header('Cache-Control', 'private, no-store');
    }

    public function revoke(Request $r, string $license, Issuance $issuer)
    {
        $issuer->revoke($license, $r->user());
        return response()->json(['ok' => true])->header('Cache-Control', 'private, no-store');
    }
}
