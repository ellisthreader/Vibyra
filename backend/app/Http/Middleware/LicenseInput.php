<?php

namespace App\Http\Middleware;

use App\Services\Membership\Licenses\Keys;
use Closure;
use Illuminate\Http\Request;

/** Remove bearer secrets before validation can flash input or handlers can log it. */
final class LicenseInput
{
    public function handle(Request $request, Closure $next)
    {
        $key = $request->input('licenseKey');
        if ($key !== null && $key !== '') {
            $request->attributes->set('license_hash', Keys::hash($key) ?? str_repeat('0', 64));
        }
        $request->request->remove('licenseKey');
        $request->query->remove('licenseKey');
        if ($request->isJson()) $request->json()->remove('licenseKey');
        return $next($request);
    }
}
