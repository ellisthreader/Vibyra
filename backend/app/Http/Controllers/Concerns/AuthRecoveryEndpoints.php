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
use Illuminate\Support\Facades\RateLimiter;
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
        return response()->view('portal')->withHeaders(\Illuminate\Support\Arr::except($this->recoverySecurityHeaders(), ['Content-Security-Policy']));
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
            $user = app(\App\Services\Remote\RemoteAccountSecurity::class)->updateIdentity((int) $user->id, function (User $user) use ($newPassword) {
                $user->forceFill([
                    'password' => Hash::make($newPassword),
                    'remember_token' => Str::random(60),
                ])->save();
                app(\App\Services\Remote\RemoteAccountSecurity::class)->revoke((int) $user->id, reason: 'password_changed');
                VibyraSession::where('user_id', $user->id)->delete();
                if (config('session.driver') === 'database') {
                    \Illuminate\Support\Facades\DB::connection(config('session.connection'))
                        ->table((string) config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
                }
                app(\App\Services\Remote\SecurityEvents::class)->record((int) $user->id, 'PASSWORD_CHANGED');
                return $user;
            });
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
        $rateLimitKey = 'email-verification-resend:'.hash('sha256', $email ?: 'missing:'.$request->ip());
        if (RateLimiter::tooManyAttempts($rateLimitKey, 1)) {
            $retryAfter = max(1, RateLimiter::availableIn($rateLimitKey));

            return $this->json([
                'ok' => true,
                'message' => "Please wait {$retryAfter} seconds before requesting another verification email.",
                'retryAfter' => $retryAfter,
            ]);
        }
        RateLimiter::hit($rateLimitKey, 60);

        $user = $email ? User::where('email', $email)->whereIn('provider', ['email', 'microsoft'])->first() : null;
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
            'retryAfter' => 60,
        ]);
    }

    public function verifyEmail(Request $request, string $id, string $hash): Response|JsonResponse
    {
        abort_unless(ctype_digit($id) && strlen($id) < 19 && $request->hasValidSignature(), 403, 'This verification link is invalid or expired.');
        $user = \Illuminate\Support\Facades\DB::transaction(function () use ($id, $hash) {
            $user = User::whereKey($id)->lockForUpdate()->first();
            abort_unless($user && hash_equals(sha1($user->getEmailForVerification()), $hash), 403, 'This verification link is invalid or expired.');
            if (!$user->hasVerifiedEmail()) $user->markEmailAsVerified();
            return $user;
        }, 3);

        app(\App\Services\Membership\Licenses\Pending::class)->complete($user);
        // An email signup's wallet exists before verification, so its trial and free tokens start here.
        // The email is already verified, so a failure here must not fail the page; free tokens still arrive on the next wallet read.
        try {
            app(\App\Services\Membership\Trials::class)->start($user);
            if (\App\Services\Membership\Units::modern($user->id)) app(\App\Services\Membership\Allowances::class)->refresh($user->id);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->view('email-verified', [
            'appUrl' => 'vibyra://email-verified?email='.rawurlencode($user->email),
        ])->withHeaders($this->recoverySecurityHeaders());
    }

    private function recoveryLinkMode(): string
    {
        $mode = strtolower(trim((string) config('auth.recovery_links.mode', 'dual')));

        return in_array($mode, ['legacy', 'dual', 'verified'], true) ? $mode : 'dual';
    }

    private function verifiedRecoveryUrl(array $parameters): string
    {
        return rtrim((string) config('app.url'), '/').'/reset-password?'.http_build_query($parameters);
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
