<?php

namespace App\Services\Auth;

use Illuminate\Http\Response;

final class ProviderSecondFactorPage
{
    public function response(): Response
    {
        return response('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            .'<title>Finish signing in to Vibyra</title></head><body style="background:#07070a;color:#fff;font-family:system-ui;'
            .'display:grid;min-height:100vh;place-items:center"><main style="max-width:520px;padding:32px;text-align:center">'
            .'<h1>Enter your authenticator code</h1><p>Google verified your identity. Return to Vibyra and enter your '
            .'authenticator or recovery code to open your existing account.</p></main></body></html>')
            ->header('Content-Type', 'text/html; charset=utf-8')->header('Cache-Control', 'no-store');
    }
}
