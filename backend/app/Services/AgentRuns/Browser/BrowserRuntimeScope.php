<?php

namespace App\Services\AgentRuns\Browser;

use App\Models\AgentV2\{Connection, Run, RuntimeBinding};
use App\Services\AgentRuns\{Access, ApiError, RuntimeBindings};
use App\Services\AgentRuns\Cloud\{Authority, Policies};
use Illuminate\Http\Request;

/** Browser authority never follows a task from the person's Mac into Cloud. */
final class BrowserRuntimeScope
{
    public static function targets(int $user): array
    {
        if (!config('agents_v2_browser.cloud_enabled')) return [];
        return RuntimeBinding::where('user_id', $user)->where('execution_target', 'cloud')->whereNull('revoked_at')
            ->where('last_seen_at', '>', now()->subMinutes(2))->get()->filter(function ($b) {
                if (!self::enabled($b)) return false;
                try { app(Policies::class)->current($b); return true; }
                catch (\Illuminate\Http\Exceptions\HttpResponseException|\Symfony\Component\HttpKernel\Exception\HttpException) { return false; }
            })->map(fn ($b) => ['id' => $b->id, 'label' => 'Cloud computer · '.$b->model])->values()->all();
    }

    public static function review(int $user, ?string $runtimeId): void
    {
        if ($runtimeId === null) return;
        $b = RuntimeBinding::whereKey($runtimeId)->where('user_id', $user)->whereNull('revoked_at')->first();
        if (!$b || !Authority::cloud($b) || !self::enabled($b))
            ApiError::throw(409, 'cloud_browser_unavailable', 'Start the updated Cloud computer before reviewing browser access.');
        app(Policies::class)->current($b);
    }

    public static function allows(Run $run, Connection $connection): bool
    {
        $cloud = ($run->runtime_snapshot['executionTarget'] ?? 'local') === 'cloud';
        if (!$cloud) return $connection->browser_runtime_id === null;
        $b = RuntimeBinding::whereKey($run->runtime_binding_id)->whereNull('revoked_at')->first();
        return $b && self::enabled($b) && (int) $b->user_id === (int) $connection->user_id
            && $connection->browser_runtime_id === $b->id;
    }

    public static function enabled(RuntimeBinding $b): bool
    {
        return config('agents_v2_browser.cloud_enabled') && Authority::cloud($b)
            && ($b->capabilities['cloudPrivateBrowserV1'] ?? false) === true
            && ($b->capabilities['browserTools'] ?? false) === true;
    }

    /** Cloud browser keys belong only to the dedicated helper, never to an AI worker. */
    public static function runner(Request $request, string $id): RuntimeBinding
    {
        $b = RuntimeBinding::whereKey($id)->whereNull('revoked_at')->first();
        if (!$b) ApiError::throw(404, 'runtime_not_found', 'This AI account binding does not exist.');
        $key = $request->header('X-Vibyra-Runner-Key');
        if (Authority::cloud($b)) {
            if (!self::enabled($b) || !is_string($key) || strlen($key) !== 64 || !$b->browser_key_hash
                || !hash_equals($b->browser_key_hash, hash('sha256', $key)))
                ApiError::throw(403, 'invalid_browser_key', 'Invalid browser helper credential.');
            app(Authority::class)->check($b);
        } else {
            $user = null;
            if (!config('agents_v2.runner_key_only')) {
                $session = app(\App\Services\Auth\SessionAuthenticator::class)->authenticate((string) $request->bearerToken(),
                    ['ip_address' => $request->ip(), 'user_agent' => (string) $request->userAgent()]);
                if (!$session || $session['session']->user->isGuest())
                    ApiError::throw(401, 'session_required', 'Sign in to use this browser runner.');
                $user = $session['session']->user_id;
            }
            $b = app(RuntimeBindings::class)->authenticate($user, $id, $key);
        }
        app(Access::class)->require($b->user_id);
        return $b;
    }
}
