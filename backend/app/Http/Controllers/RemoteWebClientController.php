<?php

namespace App\Http\Controllers;

use Illuminate\Http\{Request, Response};
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/** Static mobile web entry; its policy is separate from trusted website nonces. */
class RemoteWebClientController extends Controller
{
    public function __invoke(Request $request, string $path = ''): Response|BinaryFileResponse
    {
        if (! in_array($path, ['', 'index.html'], true)) return $this->asset($request, $path);
        return response(file_get_contents(resource_path('mobile-web/index.html')))
            ->header('Content-Type', 'text/html; charset=utf-8')
            ->header('Cache-Control', 'private, no-store')
            ->header('X-Frame-Options', 'DENY')
            ->header('Referrer-Policy', 'no-referrer')
            ->header('Content-Security-Policy', "default-src 'none'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://vibyra-production.up.railway.app; frame-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'self'; object-src 'none'; frame-ancestors 'none';");
    }
    private function asset(Request $request, string $path): BinaryFileResponse
    {
        // Only build-owned manifest entries are served; callers cannot choose a file path.
        $assets = json_decode(file_get_contents(resource_path('mobile-web/assets.json')), true, flags: JSON_THROW_ON_ERROR);
        $entry = $assets[$path] ?? null;
        abort_unless(is_array($entry), 404);
        $bridge = $path === '__vibyra/transport.html';
        $response = response()->file(resource_path('mobile-web/assets/'.$path), [
            'Content-Type' => $entry['mime'], 'Cache-Control' => $bridge ? 'private, no-store' : 'public, max-age=0, must-revalidate',
            'X-Content-Type-Options' => 'nosniff', 'Referrer-Policy' => 'no-referrer',
            'X-Frame-Options' => $bridge ? 'SAMEORIGIN' : 'DENY',
            'Content-Security-Policy' => $entry['policy'] ?? "default-src 'none'; frame-ancestors 'none'",
        ]);
        if (! $bridge) { $response->setEtag($entry['sha256']); $response->isNotModified($request); }
        return $response;
    }

}
