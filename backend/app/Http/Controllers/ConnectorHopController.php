<?php

namespace App\Http\Controllers;

use App\Http\Controllers\AgentsV2\CallbackPage;
use App\Services\ChatConnectors\OAuthFlows;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * The first stop of every connect flow (connector, v2 add-account, remote MCP, Composio). `start` gives the app this
 * link instead of the provider's page. Opening it (GET) only shows a first-party page that names the provider and the
 * masked Vibyra account the sign-in will be attached to: it sets no cookie and redirects nowhere, so a link that was
 * forwarded, prefetched or previewed binds nobody. Pressing Continue (POST, with the session's CSRF token) spends the
 * link, sets an HttpOnly, SameSite=Lax cookie holding the flow's nonce, scoped to that flow's own callback path, and
 * sends the browser on to the provider. The callback finishes only for a browser that presents the nonce.
 * "This isn't my account" fails the flow instead. The link works once.
 *
 * `api/*` is exempt from the framework's CSRF middleware, so the token is checked here against the session's own.
 */
final class ConnectorHopController extends Controller
{
    use CallbackPage;

    public function show(Request $request, string $flow, OAuthFlows $flows)
    {
        $hop = $flows->peek($flow);
        return $hop === null ? $this->gone($request) : $this->page($request, 200, ['hop' => $hop, 'title' => 'Connect '.$hop['provider'], 'detail' => '']);
    }

    public function decide(Request $request, string $flow, OAuthFlows $flows)
    {
        $sent = (string) $request->input('_token', '');
        $token = (string) $request->session()->token();
        if ($sent === '' || $token === '' || !hash_equals($token, $sent)) {
            return $this->page($request, 419, ['hop' => null, 'title' => 'This page expired', 'detail' => 'Open the sign-in link again, or go back to Vibyra and start again.']);
        }
        $choice = (string) $request->input('choice', '');
        if ($choice === 'cancel') {
            $done = $flows->cancel($flow);
            return $done === null ? $this->gone($request) : $this->finished($done['flow'], $done['provider']);
        }
        if ($choice !== 'continue') return $this->show($request, $flow, $flows);
        $hop = $flows->open($flow);
        if ($hop === null) return $this->gone($request);
        $cookie = new Cookie($hop['cookie'], $hop['nonce'], time() + OAuthFlows::MINUTES * 60 + 30, $hop['path'], null,
            $request->isSecure(), true, false, Cookie::SAMESITE_LAX);
        return redirect()->away($hop['url'])->withCookie($cookie)
            ->header('Cache-Control', 'no-store')->header('Referrer-Policy', 'no-referrer');
    }

    private function gone(Request $request)
    {
        return $this->page($request, 404, ['hop' => null, 'title' => 'Link expired',
            'detail' => 'This sign-in link has already been used or has expired. Go back to Vibyra and start again.']);
    }

    /** Never framed (clickjacking), never cached, no script, nothing loaded from anywhere. */
    private function page(Request $request, int $status, array $data)
    {
        // SecurityHeaders issues the nonce where it is registered; without it the page makes its own, so the policy below
        // is never `nonce-` (empty: a browser ignores it and then blocks the page's own style).
        $nonce = (string) $request->attributes->get('vibyra.csp_nonce', '') ?: base64_encode(random_bytes(18));
        return response()->view('connectors.hop', [...$data, 'nonce' => $nonce, 'token' => $data['hop'] ? (string) $request->session()->token() : ''], $status)
            ->header('Cache-Control', 'no-store, private')->header('Referrer-Policy', 'no-referrer')->header('X-Frame-Options', 'DENY')
            ->header('Content-Security-Policy', "default-src 'none'; style-src 'nonce-{$nonce}'; base-uri 'none'; frame-ancestors 'none'");
    }
}
