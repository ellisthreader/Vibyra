<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AuthRateLimitServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        RateLimiter::for('auth-signup', fn (Request $request) => [
            $this->limit(Limit::perMinute(5)->by($this->key(
                'signup:ip-subject:minute', $request->ip().'|'.$this->subject($request)
            ))),
            $this->limit(Limit::perHour(10)->by($this->key(
                'signup:ip-subject:hour', $request->ip().'|'.$this->subject($request)
            ))),
            $this->limit(Limit::perMinute(20)->by($this->key('signup:ip:minute', $request->ip()))),
            $this->limit(Limit::perHour(60)->by($this->key('signup:ip:hour', $request->ip()))),
        ]);
        RateLimiter::for('auth-login', fn (Request $request) => [
            $this->limit(Limit::perMinute(10)->by($this->key(
                'login:ip-subject:minute', $request->ip().'|'.$this->subject($request)
            ))),
            $this->limit(Limit::perMinute(60)->by($this->key('login:ip:minute', $request->ip()))),
        ]);
        RateLimiter::for('auth-provider-challenge', fn (Request $request) => [
            $this->limit(Limit::perMinute(12)->by($this->key('provider-challenge:client', $this->client($request)))),
            $this->limit(Limit::perMinute(60)->by($this->key('provider-challenge:ip', $request->ip()))),
        ]);
        RateLimiter::for('auth-provider-start', fn (Request $request) => [
            $this->limit(Limit::perMinute(12)->by($this->key('provider-start:client', $this->client($request)))),
            $this->limit(Limit::perMinute(60)->by($this->key('provider-start:ip', $request->ip()))),
        ]);
        RateLimiter::for('auth-provider-status', fn (Request $request) => [
            $this->limit(Limit::perMinute(120)->by($this->key(
                'provider-status:flow', (string) $request->route('flowId')
            ))),
            $this->limit(Limit::perMinute(600)->by($this->key('provider-status:ip', $request->ip()))),
        ]);
        RateLimiter::for('auth-provider-callback', fn (Request $request) => [
            $this->limit(Limit::perMinute(5)->by($this->key(
                'provider-callback:ip-state', $request->ip().'|'.(string) $request->input('state', '')
            ))),
            $this->limit(Limit::perMinute(120)->by($this->key('provider-callback:ip', $request->ip()))),
        ]);
        RateLimiter::for('auth-password-forgot', fn (Request $request) => [
            $this->limit(Limit::perHour(5)->by($this->key('password-forgot:subject', $this->subject($request)))),
            $this->limit(Limit::perHour(30)->by($this->key('password-forgot:ip', $request->ip()))),
        ]);
    }

    private function client(Request $request): string
    {
        $installId = mb_substr(trim((string) $request->input('installId', '')), 0, 128);
        if ($installId !== '') {
            return 'install:'.$installId;
        }

        $sessionId = $request->hasSession() ? $request->session()->getId() : '';

        return $sessionId !== '' ? 'session:'.$sessionId : 'ip:'.$request->ip();
    }

    private function subject(Request $request): string
    {
        $email = strtolower(trim((string) $request->input('email', '')));

        return $email !== '' ? 'email:'.$email : $this->client($request);
    }

    private function key(string $scope, string $value): string
    {
        return 'auth:'.$scope.':'.hash('sha256', $value);
    }

    private function limit(Limit $limit): Limit
    {
        return $limit->response(static function (Request $request, array $headers): JsonResponse {
            $retryAfter = max(1, (int) ($headers['Retry-After'] ?? 60));

            return response()->json([
                'ok' => false,
                'error' => 'Too many attempts for this step. Wait a moment and try again.',
                'retryAfter' => $retryAfter,
            ], 429, $headers);
        });
    }
}
