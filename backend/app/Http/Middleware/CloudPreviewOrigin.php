<?php
namespace App\Http\Middleware;

use App\Services\CloudWorkspaces\Preview;
use Closure;
use Illuminate\Http\Request;

/** Intercepts the whole untrusted preview origin before account routes, cookies or sessions. */
final class CloudPreviewOrigin
{
    public function handle(Request $request, Closure $next)
    {
        $domain = config('cloud_workspaces.preview_domain'); $host = $request->getHost();
        if (!$domain || !($host === $domain || str_ends_with($host, '.'.$domain))) return $next($request);
        abort_unless(config('cloud_workspaces.preview_enabled') && preg_match('/^([a-z0-9]{40})\.'.preg_quote($domain, '/').'$/', $host, $match), 404);
        return app(Preview::class)->response($request, $match[1]);
    }
}
