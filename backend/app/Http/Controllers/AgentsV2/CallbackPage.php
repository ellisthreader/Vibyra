<?php

namespace App\Http\Controllers\AgentsV2;

use App\Services\ChatConnectors\OAuthFlows;

/** The browser's last stop after a provider sign-in: back to the app, or a plain closing page. */
trait CallbackPage
{
    private function finished(?array $flow, string $name)
    {
        $flows = app(OAuthFlows::class);
        if ($flow && ($to = $flows->returnTo($flow))) return redirect()->away($to);
        $ok = $flow && $flows->status((string) $flow['flowId'], (int) $flow['userId'])['status'] === 'connected';
        [$title, $detail] = $ok ? [$name.' is connected', 'You can close this page and go back to Vibyra.']
            : [$name.' was not connected', 'You can close this page and try again in Vibyra.'];
        return response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
            .'<title>'.e($title).'</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;'
            .'font:16px/1.5 -apple-system,system-ui,sans-serif;background:#0E0F12;color:#F5F7FA">'
            .'<main style="text-align:center;padding:24px"><h1 style="font-size:23px;margin:0 0 8px">'.e($title).'</h1>'
            .'<p style="margin:0;color:#A6ADBA">'.e($detail).'</p></main>')->header('Content-Type', 'text/html')
            ->header('Cache-Control', 'no-store');
    }
}
