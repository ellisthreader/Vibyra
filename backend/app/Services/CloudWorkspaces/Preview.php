<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class Preview
{
    public function ticket(Request $request, object $w, int $port): array
    {
        $authority = app(Access::class)->verify($request, $w);
        $domain = config('cloud_workspaces.preview_domain');
        abort_unless(config('cloud_workspaces.preview_enabled') && is_string($domain) && preg_match('/^[a-z0-9.-]+$/', $domain)
            && $w->state === 'ready' && now()->lt($w->lease_until), 409, 'Cloud web preview is unavailable.');
        // A different site from the account service; every ticket has a separate browser origin.
        foreach (array_filter([parse_url(config('cloud_workspaces.api_origin'), PHP_URL_HOST), config('remote_security.rp_id'), config('session.domain')]) as $accountDomain) {
            $accountDomain = ltrim($accountDomain, '.');
            abort_if($domain === $accountDomain || str_ends_with($domain, '.'.$accountDomain), 503, 'Preview needs a separate account domain.');
        }
        $token = strtolower(Str::random(40));
        DB::table('cloud_preview_tickets')->insert(['hash' => hash('sha256', $token), 'workspace_id' => $w->id,
            'generation' => $w->generation, 'device_id' => $authority['device'], 'device_generation' => $authority['deviceGeneration'],
            'session_id' => $authority['session'], 'port' => $port, 'expires_at' => now()->addMinutes(2), 'created_at' => now(), 'updated_at' => now()]);
        return ['url' => 'https://'.$token.'.'.$domain.'/', 'expiresAt' => now()->addMinutes(2)->timestamp];
    }
    public function authority(string $token): object
    {
        $t = DB::table('cloud_preview_tickets')->where('hash', hash('sha256', $token))->where('expires_at', '>', now())->first();
        abort_unless($t, 403, 'Preview link expired. Open it again in Vibyra.');
        $w = DB::table('cloud_workspaces')->where('id', $t->workspace_id)->first();
        $s = DB::table('vibyra_sessions')->where('id', $t->session_id)->whereNull('revoked_at')
            ->where('idle_expires_at', '>', now())->where('absolute_expires_at', '>', now())->first();
        abort_unless($w && $s && $s->user_id == $w->user_id && $w->generation === $t->generation && $w->state === 'ready'
            && $w->lease_until && now()->lt($w->lease_until) && app(Access::class)->deviceActive($t->device_id, $t->device_generation, $w->user_id), 403, 'Preview authority changed.');
        return (object) ['workspace' => $w, 'port' => $t->port];
    }
    public function response(Request $request, string $token)
    {
        $key = 'cloud-preview:'.hash('sha256', $token);
        abort_if(\Illuminate\Support\Facades\RateLimiter::tooManyAttempts($key, 120), 429);
        \Illuminate\Support\Facades\RateLimiter::hit($key, 60);
        abort_unless(in_array($request->method(), ['GET', 'HEAD'], true), 405, 'Preview supports reads only.');
        abort_if(strlen($request->getRequestUri()) > 2048 || str_contains($request->getRequestUri(), '\\'), 422, 'Invalid preview path.');
        $scope = $this->authority($token); $id = (string) Str::uuid();
        $a = DB::transaction(function () use ($scope, $id, $request) {
            app(\App\Services\Vibes\Wallet::class)->lock($scope->workspace->user_id);
            $fresh = DB::table('cloud_workspaces')->where('id', $scope->workspace->id)->firstOrFail();
            return app(Actions::class)->create($fresh, $id, 'preview', ['port' => $scope->port, 'path' => $request->getRequestUri()]);
        }, 5);
        // Bounded broker wait. Never sends account cookies, bearer tokens or client headers to project code.
        $deadline = microtime(true) + 8;
        do {
            usleep(50000); $a = DB::table('cloud_actions')->where('id', $id)->firstOrFail();
        } while (in_array($a->state, ['queued', 'running'], true) && microtime(true) < $deadline);
        $this->authority($token);
        abort_unless($a->state === 'completed', 504, 'Cloud preview timed out.');
        $r = json_decode($a->result, true); $body = base64_decode($r['body'] ?? '', true);
        abort_unless(!isset($r['error']) && $body !== false && strlen($body) <= 131072, 502, 'Cloud preview response is unavailable or too large.');
        $type = $r['contentType'] ?? 'application/octet-stream';
        abort_unless(is_string($type) && !preg_match('/[\r\n]/', $type), 502);
        $status = (int) ($r['status'] ?? 502); abort_unless($status >= 200 && $status < 500 && !in_array($status, [301, 302, 303, 307, 308]), 502, 'Preview redirects are blocked.');
        return response($request->method() === 'HEAD' ? '' : $body, $status, ['Content-Type' => $type, 'Cache-Control' => 'no-store',
            'Referrer-Policy' => 'no-referrer', 'X-Content-Type-Options' => 'nosniff',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()',
            'Content-Security-Policy' => "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin"]);
    }
}
