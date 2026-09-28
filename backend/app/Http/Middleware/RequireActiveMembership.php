<?php

namespace App\Http\Middleware;

use App\Services\Billing\MembershipEntitlement;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireActiveMembership
{
    public function __construct(private readonly MembershipEntitlement $entitlement) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $this->entitlement->active($user)) {
            return $next($request);
        }

        if ($request->expectsJson() || $request->is('web-api/*')) {
            return response()->json([
                'ok' => false,
                'code' => 'membership_required',
                'error' => 'An active Vibyra membership is required.',
                'billingUrl' => '/billing',
            ], 403);
        }

        return redirect('/billing');
    }
}
