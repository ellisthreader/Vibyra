<?php

namespace App\Http\Controllers;

use App\Http\Middleware\VerifyHuman;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class HumanCheckController extends Controller
{
    private const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    private const COOKIE_MINUTES = 60 * 24 * 30;

    public function __invoke(Request $request): RedirectResponse
    {
        $returnTo = $this->safeReturnPath((string) $request->input('return_to', '/'));

        if (! VerifyHuman::enabled()) {
            return redirect($returnTo);
        }

        if (! $this->passes((string) $request->input('cf-turnstile-response', ''), $request->ip())) {
            $separator = str_contains($returnTo, '?') ? '&' : '?';

            return redirect($returnTo.$separator.'check_failed=1');
        }

        return redirect($returnTo)->withCookie(cookie(
            VerifyHuman::COOKIE,
            '1',
            self::COOKIE_MINUTES,
            secure: $request->isSecure(),
            httpOnly: true,
            sameSite: 'lax',
        ));
    }

    private function passes(string $token, ?string $ip): bool
    {
        if ($token === '' || strlen($token) > 2048) {
            return false;
        }

        try {
            $result = Http::asForm()->timeout(8)->post(self::VERIFY_URL, array_filter([
                'secret' => config('services.turnstile.secret_key'),
                'response' => $token,
                'remoteip' => $ip,
            ]));
        } catch (Throwable $error) {
            Log::warning('Turnstile verification request failed', ['error' => $error->getMessage()]);

            return false;
        }

        return $result->successful() && $result->json('success') === true;
    }

    // Only same-site paths, so the form can't be used to bounce visitors elsewhere.
    private function safeReturnPath(string $path): string
    {
        $path = preg_replace('/([?&])check_failed=1(&|$)/', '$1', $path);
        $path = rtrim((string) $path, '?&');

        if ($path === '' || $path[0] !== '/' || str_starts_with($path, '//') || str_contains($path, '\\')) {
            return '/';
        }

        return $path;
    }
}
