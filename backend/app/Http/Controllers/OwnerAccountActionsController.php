<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Owner\{AccountActions, AccountProfile};
use Illuminate\Http\{JsonResponse, Request};
use Illuminate\Support\Facades\DB;

final class OwnerAccountActionsController extends Controller
{
    public function show(Request $request, string $account): JsonResponse
    {
        $input = $request->validate(['before' => 'nullable|integer|min:1']);
        return response()->json(app(AccountProfile::class)->for(User::findOrFail($account),
            $request->user('web')->id, isset($input['before']) ? (int) $input['before'] : null));
    }

    public function store(Request $request, string $account): JsonResponse
    {
        $input = $request->validate([
            'request_id' => 'required|uuid', 'revision' => 'required|integer|min:0',
            'action' => 'required|in:credit,warn,ban,unban', 'reason' => 'required|string|min:3|max:500',
            'amount' => 'required_if:action,credit|nullable|integer|min:1|max:10000',
            'balance' => 'required_if:action,credit|nullable|in:tokens,vibes,credits',
            'message' => 'required_if:action,warn|nullable|string|min:3|max:1000',
        ]);
        // Canonical fields prevent ordering differences from changing replay identity.
        $terms = ['request_id' => strtolower($input['request_id']), 'revision' => (int) $input['revision'],
            'action' => $input['action'], 'reason' => trim($input['reason']),
            'amount' => $input['action'] === 'credit' ? (int) $input['amount'] : null,
            'balance' => $input['action'] === 'credit' ? $input['balance'] : null,
            'message' => $input['action'] === 'warn' ? trim($input['message']) : null];
        $receipt = app(AccountActions::class)->apply($request->user('web')->id, (int) User::findOrFail($account)->id,
            $terms, (int) $request->session()->get('owner_second_factor_verified_at'));
        return response()->json(['ok' => true, 'receipt' => $receipt]);
    }

    public function receipt(Request $request, string $account, string $requestId): JsonResponse
    {
        $row = DB::table('owner_account_actions')->where('id', $requestId)->where('user_id', $account)
            ->where('actor_id', $request->user('web')->id)->first();
        return response()->json(['ok' => true, 'receipt' => $row ? json_decode($row->result, true) : null]);
    }

    public function cancel(Request $request, string $account, string $requestId): JsonResponse
    {
        $receipt = app(\App\Services\Owner\ActionCancellation::class)->cancel($request->user('web')->id,
            (int) User::findOrFail($account)->id, strtolower($requestId),
            (int) $request->session()->get('owner_second_factor_verified_at'));
        return response()->json(['ok' => true, 'receipt' => $receipt]);
    }
}
