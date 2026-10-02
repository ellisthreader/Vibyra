<?php

namespace App\Http\Middleware;

use App\Services\Auth\TwoFactor;
use Closure;
use Illuminate\Http\Request;

final class RequireOwnerSecondFactor
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user('web')->fresh();
        $at = $request->session()->get('owner_second_factor_verified_at');
        $for = $request->session()->get('owner_second_factor_user_id');
        if (!app(TwoFactor::class)->enabled($user) || !is_numeric($at) || (int) $for !== (int) $user->id
            || (int) $at < now()->subMinutes(10)->timestamp || (int) $at > now()->timestamp) {
            return response()->json(['ok' => false, 'error' => 'owner_two_factor_required',
                'enabled' => app(TwoFactor::class)->enabled($user), 'provider' => $user->provider ?: 'email'], 428)
                ->header('Cache-Control', 'private, no-store');
        }
        $response = $next($request);
        if ($response instanceof \Illuminate\Http\JsonResponse) {
            $response->setData([...$response->getData(true), 'ownerAccessExpiresAt' => ((int) $at + 600) * 1000]);
        }
        return $response->header('Cache-Control', 'private, no-store');
    }
}
