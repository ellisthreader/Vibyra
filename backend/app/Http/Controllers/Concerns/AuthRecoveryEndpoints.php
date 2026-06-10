<?php

namespace App\Http\Controllers\Concerns;

use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use RuntimeException;

trait AuthRecoveryEndpoints
{
    public function openPasswordReset(Request $request): RedirectResponse
    {
        $parameters = [
            'token' => trim((string) $request->query('token', '')),
            'email' => trim((string) $request->query('email', '')),
        ];
        $mode = $this->recoveryLinkMode();
        $target = $mode === 'verified'
            ? $this->verifiedRecoveryUrl($parameters)
            : 'vibyra://reset-password?'.http_build_query($parameters);

        return redirect()->away($target)->withHeaders($this->recoverySecurityHeaders());
    }

    public function showPasswordResetLink(Request $request): Response
    {
        $token = trim((string) $request->query('token', ''));
        $email = trim((string) $request->query('email', ''));
        $valid = $token !== '' && strlen($token) <= 512 && $email !== '' && strlen($email) <= 320;
        $message = $valid
            ? 'Open this link on a device with Vibyra installed to reset your password.'
            : 'This password reset link is incomplete or invalid.';

        return response(
            '<!doctype html><html lang="en"><head><meta charset="utf-8">'
            .'<meta name="viewport" content="width=device-width,initial-scale=1">'
            .'<meta name="referrer" content="no-referrer"><title>Vibyra password reset</title>'
            .'</head><body><main><h1>Vibyra password reset</h1><p>'
            .e($message).'</p></main></body></html>',
            $valid ? 200 : 400,
            $this->recoverySecurityHeaders()
        );
    }

    public function appleAppSiteAssociation(): JsonResponse
    {
        $appId = trim((string) config('auth.recovery_links.apple_app_id'));
        if (! preg_match('/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/', $appId)
            || str_starts_with($appId, 'TEAMID.')) {
            return $this->associationUnavailable();
        }

        return response()->json([
            'applinks' => [
                'apps' => [],
                'details' => [[
                    'appID' => $appId,
                    'components' => [[
                        '/' => '/reset-password',
                        'comment' => 'Vibyra password recovery',
                    ]],
                ]],
            ],
        ])->withHeaders($this->associationHeaders());
    }

    public function androidAssetLinks(): JsonResponse
    {
        $package = trim((string) config('auth.recovery_links.android_package'));
        $fingerprints = config('auth.recovery_links.android_sha256_cert_fingerprints', []);
        $fingerprints = is_array($fingerprints)
            ? array_values(array_filter(array_map('trim', $fingerprints)))
            : [];
        $validPackage = preg_match('/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/', $package);
        $validFingerprints = $fingerprints !== [] && collect($fingerprints)->every(
            fn (string $fingerprint): bool => (bool) preg_match(
                '/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/',
                $fingerprint
            )
        );
        if (! $validPackage || ! $validFingerprints) {
            return $this->associationUnavailable();
        }

        return response()->json([[
            'relation' => ['delegate_permission/common.handle_all_urls'],
            'target' => [
                'namespace' => 'android_app',
                'package_name' => $package,
                'sha256_cert_fingerprints' => $fingerprints,
            ],
        ]])->withHeaders($this->associationHeaders());
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $email = $this->normalizeEmail($request->input('email'));
        $user = $email ? User::where('email', $email)->where('provider', 'email')->first() : null;
        if ($user) {
            try {
                $user->sendPasswordResetNotification(Password::broker()->createToken($user));
            } catch (\Throwable) {
                // Keep the response generic and allow a later retry.
            }
        }

        return $this->json([
            'ok' => true,
            'message' => 'If that email belongs to a Vibyra password account, a reset link has been sent.',
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $email = $this->normalizeEmail($request->input('email'));
        $password = (string) $request->input('password', '');
        $token = trim((string) $request->input('token', ''));
        $resetUser = $email ? User::where('email', $email)->where('provider', 'email')->first() : null;
        if (! $resetUser || $token === '' || strlen($password) < 8 || $password !== $request->input('passwordConfirmation')) {
            return $this->json(['ok' => false, 'error' => 'Enter a valid reset link and matching password with at least 8 characters.'], 422);
        }

        $status = Password::reset([
            'email' => $email,
            'password' => $password,
            'password_confirmation' => $request->input('passwordConfirmation'),
            'token' => $token,
        ], function (User $user, string $newPassword): void {
            if ($user->provider !== 'email') {
                return;
            }
            $user->forceFill([
                'password' => Hash::make($newPassword),
                'remember_token' => Str::random(60),
            ])->save();
            VibyraSession::where('user_id', $user->id)->delete();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            return $this->json(['ok' => false, 'error' => 'This password reset link is invalid or expired.'], 422);
        }

        return $this->json(['ok' => true, 'message' => 'Your password has been reset. Log in with the new password.']);
    }

    public function resendEmailVerification(Request $request): JsonResponse
    {
        $email = $this->normalizeEmail($request->input('email'));
        $user = $email ? User::where('email', $email)->where('provider', 'email')->first() : null;
        if ($user && ! $user->hasVerifiedEmail()) {
            try {
                $user->sendEmailVerificationNotification();
            } catch (\Throwable) {
                // Keep the response generic and allow a later retry.
            }
        }

        return $this->json([
            'ok' => true,
            'message' => 'If that email still needs verification, a new link has been sent.',
        ]);
    }

    public function verifyEmail(Request $request, string $id, string $hash): RedirectResponse|JsonResponse
    {
        $user = User::find($id);
        if (! $request->hasValidSignature()
            || ! $user
            || ! hash_equals(sha1($user->getEmailForVerification()), $hash)) {
            return $this->json(['ok' => false, 'error' => 'This verification link is invalid or expired.'], 403);
        }

        if (! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        return redirect()->away('vibyra://email-verified?email='.rawurlencode($user->email));
    }

    private function recoveryLinkMode(): string
    {
        $mode = strtolower(trim((string) config('auth.recovery_links.mode', 'dual')));

        return in_array($mode, ['legacy', 'dual', 'verified'], true) ? $mode : 'dual';
    }

    private function verifiedRecoveryUrl(array $parameters): string
    {
        $configured = trim((string) config('auth.recovery_links.verified_url'));
        $parts = parse_url($configured);
        if (! is_array($parts)
            || ($parts['scheme'] ?? null) !== 'https'
            || empty($parts['host'])
            || ($parts['path'] ?? '') !== '/reset-password'
            || isset($parts['port'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])) {
            throw new RuntimeException('RECOVERY_VERIFIED_URL must be an exact HTTPS /reset-password URL.');
        }

        return $configured.'?'.http_build_query($parameters);
    }

    private function recoverySecurityHeaders(): array
    {
        return [
            'Cache-Control' => 'no-store, max-age=0',
            'Content-Security-Policy' => "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            'Referrer-Policy' => 'no-referrer',
            'X-Content-Type-Options' => 'nosniff',
            'X-Robots-Tag' => 'noindex, nofollow, noarchive',
        ];
    }

    private function associationHeaders(): array
    {
        return [
            'Cache-Control' => 'public, max-age=300',
            'Referrer-Policy' => 'no-referrer',
            'X-Content-Type-Options' => 'nosniff',
        ];
    }

    private function associationUnavailable(): JsonResponse
    {
        return response()->json([
            'error' => 'Association credentials are not configured.',
        ], 503)->withHeaders($this->associationHeaders());
    }
}
