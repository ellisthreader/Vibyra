<?php

namespace App\Http\Controllers;

use App\Services\Auth\TwoFactor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OwnerAccountsController extends Controller
{
    public function index(Request $request, \App\Services\Owner\AccountDirectory $directory): JsonResponse
    {
        $input = $request->validate([
            'page' => 'sometimes|integer|min:1|max:100000',
            'search' => 'nullable|string|max:120',
            'status' => 'nullable|in:all,active,banned',
        ]);
        return response()->json($directory->search($input));
    }

    public function verify(Request $request, TwoFactor $twoFactor): JsonResponse
    {
        $user = $request->user('web')->fresh();
        if (! $twoFactor->enabled($user)) {
            return response()->json(['ok' => false, 'error' => 'Set up two-factor authentication first.'], 403);
        }
        $code = $request->validate(['code' => 'required|string|max:32'])['code'];
        if (! $twoFactor->check($user, $code)) {
            return response()->json(['ok' => false, 'error' => 'Invalid or already-used code.'], 422);
        }

        $request->session()->put('owner_second_factor_verified_at', now()->timestamp);
        $request->session()->put('owner_second_factor_user_id', $user->id);

        return response()->json(['ok' => true, 'expires_at' => now()->addMinutes(10)->toIso8601String()])
            ->header('Cache-Control', 'private, no-store');
    }
}
