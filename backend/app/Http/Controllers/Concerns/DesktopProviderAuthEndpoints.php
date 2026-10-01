<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Analytics\AuthLoginRecorder;

use App\Models\User;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Auth\DesktopProviderTokenExchange;
use App\Services\Auth\ProviderAccountException;
use App\Services\Auth\ProviderAccountService;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\ProviderIdentityVerifier;
use App\Services\Auth\ProviderEnrollmentProof;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Throwable;

trait DesktopProviderAuthEndpoints
{
    public function desktopProviderStart(Request $request, string $provider): JsonResponse
    {
        $provider = strtolower($provider);
        try {
            $purpose = strtolower(trim((string) $request->input('purpose', '')));
            if ($purpose === '') {
                $flow = app(DesktopProviderOAuthFlow::class)->start($provider, $request->all(), null, app(\App\Services\Legal\TrustedClientIp::class)->forOAuthRequest($request));
            } elseif ($purpose === 'deletion') {
                $user = $this->authenticatedUser($request);
                if (($user->provider ?: 'email') !== $provider || trim((string) $user->provider_id) === '') {
                    return $this->json([
                        'ok' => false,
                        'error' => 'Sign in with the provider linked to this Vibyra account.',
                    ], 403);
                }
                $flow = app(DesktopProviderOAuthFlow::class)->startDeletion(
                    $provider,
                    (int) $user->getKey(),
                    (string) $user->provider_id,
                );
            } else {
                throw new ProviderIdentityException('Unsupported desktop OAuth purpose.');
            }
        } catch (ProviderIdentityException $error) {
            return $this->json(['ok' => false, 'error' => $error->getMessage()], 422);
        }

        return $this->json(['ok' => true, ...$flow]);
    }

    public function desktopProviderStatus(Request $request, string $provider, string $flowId): JsonResponse
    {
        $secret = (string) $request->header('X-Vibyra-Flow-Secret', '');
        $result = app(DesktopProviderOAuthFlow::class)->status(strtolower($provider), $flowId, null, $secret);
        $status = match ($result['status'] ?? null) {
            'expired' => 410,
            'forbidden' => 403,
            default => 200,
        };

        return $this->json($result, $status);
    }

    public function desktopProviderCallback(Request $request, string $provider): Response
    {
        $provider = strtolower($provider);
        $flow = null;
        $confirmation = $this->providerCallbackConfirmation($request, $provider);
        if ($confirmation !== null) {
            return $confirmation;
        }
        try {
            $flow = app(DesktopProviderOAuthFlow::class)->consumeState(
                $provider,
                trim((string) $request->input('state', ''))
            );
            if ($request->filled('error')) {
                throw new ProviderIdentityException('The provider sign-in was cancelled or denied.');
            }
            $tokens = app(DesktopProviderTokenExchange::class)->exchange(
                $provider,
                trim((string) $request->input('code', '')),
                $flow
            );
            $identity = app(ProviderIdentityVerifier::class)->verify(
                $provider,
                $tokens['identityToken'],
                $flow['nonce']
            );
            if (($flow['purpose'] ?? null) === 'deletion') {
                $this->deleteVerifiedProviderAccount($provider, $flow, $identity);
                app(DesktopProviderOAuthFlow::class)->finish($flow['flowId'], [
                    'ok' => true,
                    'status' => 'complete',
                    'deleted' => true,
                ]);

                return $this->desktopProviderResultPage(true, '', true);
            }
            if (($flow['purpose'] ?? null) === 'two_factor_enrollment') {
                $proof = app(ProviderEnrollmentProof::class)->issue($flow, $provider, $identity);
                app(DesktopProviderOAuthFlow::class)->finish($flow['flowId'], [
                    'ok' => true, 'status' => 'complete', 'enrollmentProof' => $proof,
                ]);

                return $this->desktopProviderResultPage(true, '', false, true);
            }
            $sessionRequest = Request::create('/api/auth/desktop/session', 'POST', [
                'deviceName' => $flow['deviceName'],
                'installId' => $flow['installId'],
                'publicIp' => $flow['publicIp'],
                'name' => $this->providerCallbackName($request),
            ]);
            $sessionRequest->headers->set('User-Agent', 'Vibyra Desktop OAuth');
            $account = app(ProviderAccountService::class)->resolveWithStatus(
                $sessionRequest,
                $provider,
                $identity
            );
            $payload = $this->sessionPayload($sessionRequest, $account['user']);
            if ($flow['deviceName'] !== 'Vibyra Website') {
                app(AuthLoginRecorder::class)->record($account['user'], 'desktop', $provider);
            }
            app(DesktopProviderOAuthFlow::class)->finish($flow['flowId'], [
                ...$payload,
                'isNewUser' => $account['created'],
                'status' => 'complete',
            ]);

            return $this->desktopProviderResultPage(true);
        } catch (ProviderAccountException $error) {
            if ($flow) {
                app(DesktopProviderOAuthFlow::class)->finish($flow['flowId'], [
                    'ok' => false,
                    'status' => 'failed',
                    'error' => $error->getMessage(),
                ]);
            }

            return $this->desktopProviderResultPage(false, $error->getMessage());
        } catch (Throwable) {
            $message = 'The provider could not verify this sign-in. Try again.';
            if ($flow) {
                app(DesktopProviderOAuthFlow::class)->finish($flow['flowId'], [
                    'ok' => false,
                    'status' => 'failed',
                    'error' => $message,
                ]);
            }

            return $this->desktopProviderResultPage(false, $message);
        }
    }

    /**
     * When the sign-in link comes back on a different network from the app that
     * started it, someone may have sent the link to this person. Ask before
     * issuing a session instead of finishing silently.
     */
    private function providerCallbackConfirmation(Request $request, string $provider): ?Response
    {
        $flows = app(DesktopProviderOAuthFlow::class);
        $state = trim((string) $request->input('state', ''));
        $code = (string) $request->input('code', '');
        $flow = $flows->peekState($provider, $state);
        if ($flow === null || $request->filled('error') || ! $flows->needsConfirmation($flow, app(\App\Services\Legal\TrustedClientIp::class)->forOAuthRequest($request))) {
            return null;
        }
        $token = hash_hmac('sha256', $state.'|'.$code, (string) config('app.key'));
        if ($request->isMethod('POST') && $request->input('vibyra_confirm') === 'continue'
            && hash_equals($token, (string) $request->input('vibyra_confirm_token', ''))) {
            return null;
        }

        $fields = '';
        foreach ($request->except(['vibyra_confirm', 'vibyra_confirm_token']) as $name => $value) {
            if (is_string($value)) {
                $fields .= '<input type="hidden" name="'.e($name).'" value="'.e($value).'">';
            }
        }
        $fields .= '<input type="hidden" name="vibyra_confirm_token" value="'.e($token).'">';
        $device = e((string) ($flow['deviceName'] ?? 'a Vibyra app'));
        $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            .'<meta name="robots" content="noindex"><title>Finish signing in?</title></head>'
            .'<body style="margin:0;background:#07070a;color:#fff;font-family:Inter,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center">'
            .'<main style="max-width:520px;padding:32px;text-align:center"><h1>Did you start this sign-in?</h1>'
            .'<p style="color:#b9b5c8;line-height:1.6">This sign-in was started on <strong>'.$device.'</strong> from a different network. '
            .'Only continue if you started it yourself on your own device. If someone sent you this link, close this tab.</p>'
            .'<form method="POST" action="'.e($request->url()).'">'.$fields
            .'<button name="vibyra_confirm" value="continue" style="margin-top:16px;padding:12px 22px;border-radius:10px;border:0;background:#4f7bff;color:#fff;font-size:15px;cursor:pointer">Yes, I started it</button>'
            .'</form></main></body></html>';

        return response($html, 200)
            ->header('Content-Type', 'text/html; charset=utf-8')
            ->header('Cache-Control', 'no-store')
            ->header('X-Frame-Options', 'DENY');
    }

    private function providerCallbackName(Request $request): string
    {
        $user = json_decode((string) $request->input('user', ''), true);
        $first = trim((string) ($user['name']['firstName'] ?? ''));
        $last = trim((string) ($user['name']['lastName'] ?? ''));

        return trim("{$first} {$last}");
    }

    private function deleteVerifiedProviderAccount(string $provider, array $flow, array $identity): void
    {
        $expectedSubject = (string) ($flow['providerSubject'] ?? '');
        $returnedSubject = (string) ($identity['subject'] ?? '');
        if ($expectedSubject === '' || ! hash_equals($expectedSubject, $returnedSubject)) {
            throw new ProviderIdentityException('The provider account does not match this Vibyra account.');
        }

        $user = User::find((int) ($flow['accountId'] ?? 0));
        if (! $user
            || ($user->provider ?: 'email') !== $provider
            || ! hash_equals($expectedSubject, (string) $user->provider_id)) {
            throw new ProviderIdentityException('The Vibyra account is no longer valid for this deletion.');
        }

        app(\App\Services\Account\AccountDeletion::class)->delete($user);
    }

    private function desktopProviderResultPage(
        bool $success,
        string $error = '',
        bool $deleted = false,
        bool $enrollment = false,
    ): Response
    {
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
