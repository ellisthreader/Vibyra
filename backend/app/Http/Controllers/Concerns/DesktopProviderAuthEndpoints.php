<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Services\Auth\DesktopProviderOAuthFlow;
use App\Services\Auth\DesktopProviderTokenExchange;
use App\Services\Auth\ProviderAccountException;
use App\Services\Auth\ProviderAccountService;
use App\Services\Auth\ProviderIdentityException;
use App\Services\Auth\ProviderIdentityVerifier;
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
                $flow = app(DesktopProviderOAuthFlow::class)->start($provider, $request->all());
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

    public function desktopProviderStatus(string $provider, string $flowId): JsonResponse
    {
        $result = app(DesktopProviderOAuthFlow::class)->status(strtolower($provider), $flowId);

        return $this->json($result, ($result['status'] ?? null) === 'expired' ? 410 : 200);
    }

    public function desktopProviderCallback(Request $request, string $provider): Response
    {
        $provider = strtolower($provider);
        $flow = null;
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

        $user->delete();
    }

    private function desktopProviderResultPage(
        bool $success,
        string $error = '',
        bool $deleted = false,
    ): Response
    {
        $title = $success
            ? ($deleted ? 'Vibyra account deleted' : 'Signed in to Vibyra')
            : 'Vibyra sign-in failed';
        $message = $success
            ? 'You can close this browser tab and return to Vibyra Desktop.'
            : $error;
        $html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
            .'<title>'.e($title).'</title></head><body style="margin:0;background:#07070a;color:#fff;'
            .'font-family:Inter,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center">'
            .'<main style="max-width:520px;padding:32px;text-align:center"><h1>'.e($title).'</h1>'
            .'<p style="color:#b9b5c8;line-height:1.6">'.e($message).'</p></main></body></html>';

        return response($html, $success ? 200 : 400)->header('Content-Type', 'text/html; charset=utf-8');
    }
}
