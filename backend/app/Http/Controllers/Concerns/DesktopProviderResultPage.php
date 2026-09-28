<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Response;

trait DesktopProviderResultPage
{
    private function desktopProviderResultPage(
        bool $success,
        string $error = '',
        bool $deleted = false,
        bool $enrollment = false,
    ): Response {
        $title = $success
            ? ($deleted ? 'Vibyra account deleted' : ($enrollment ? 'Identity verified' : 'Signed in to Vibyra'))
            : 'Vibyra sign-in failed';
        $message = $success
            ? ($enrollment ? 'Return to Vibyra to finish authenticator setup.'
                : 'You can close this browser tab and return to Vibyra Desktop.')
            : $error;
        $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            .'<title>'.e($title).'</title></head><body style="margin:0;background:#07070a;color:#fff;'
            .'font-family:Inter,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center">'
            .'<main style="max-width:520px;padding:32px;text-align:center"><h1>'.e($title).'</h1>'
            .'<p style="color:#b9b5c8;line-height:1.6">'.e($message).'</p></main></body></html>';

        return response($html, $success ? 200 : 400)->header('Content-Type', 'text/html; charset=utf-8');
    }
}
