<?php

namespace App\Http\Middleware;

use App\Services\Analytics\Recorder;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RecordWebsiteView
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if ($response->getStatusCode() === 200) {
            $path = $request->path();
            app(Recorder::class)->website($request, 'website_page_view', $path === '/' ? '/' : '/'.$path);
        }

        return $response;
    }
}
