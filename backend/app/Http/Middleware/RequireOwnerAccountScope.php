<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** A stale tab must never submit an action as a different signed-in owner. */
final class RequireOwnerAccountScope
{
    public function handle(Request $request, Closure $next)
    {
        $expected = $request->header('X-Owner-Account');
        if ((!$request->isMethod('GET') || $expected !== null)
            && (!is_string($expected) || $expected !== (string) $request->user('web')->id)) {
            return response()->json(['ok' => false, 'error' => 'Your signed-in account changed. Reload the owner dashboard.'], 403);
        }
        $response = $next($request);
        if ($response instanceof \Illuminate\Http\JsonResponse) {
            $response->setData([...$response->getData(true), 'ownerAccountId' => $request->user('web')->id]);
        }
        return $response;
    }
}
