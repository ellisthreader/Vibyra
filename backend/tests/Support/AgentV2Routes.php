<?php

namespace Tests\Support;

use App\Services\AgentRuns\Connections\LegacyInstalls;
use Illuminate\Support\Facades\{Crypt, DB, Http};

/**
 * Stage 2 provider fakes for Agent V2 tests: a tiny method + URL-regex router over
 * Http::fake (later routes win), install rows for any provider, and approvals.
 * Every provider outcome here is simulated; none is live provider evidence.
 */
trait AgentV2Routes
{
    private array $routes = [];
    private bool $routesFaked = false;

    protected function route(string $method, string $pattern, mixed $response): void
    {
        $this->routes[] = [$method, $pattern, $response];
        if ($this->routesFaked) return;
        $this->routesFaked = true;
        Http::fake(function ($request) {
            foreach (array_reverse($this->routes) as [$m, $p, $r]) {
                if ($request->method() === $m && preg_match($p, urldecode($request->url())))
                    return is_callable($r) ? $r($request) : $r;
            }
            return null;
        });
    }

    protected function timeout(): \Closure
    {
        return fn ($request) => (Http::failedConnection('cURL error 28: Operation timed out'))($request);
    }

    /** An existing ordinary-chat install for any provider, mapped to its V2 connection id. */
    protected function providerInstall(string $provider, string $identity, string $token): string
    {
        DB::table('vibes_integration_installs')->updateOrInsert(['user_id' => $this->user->id, 'integration' => $provider], [
            'credential' => Crypt::encryptString($token), 'account_label' => $identity, 'connected_at' => now(),
            'created_at' => now(), 'updated_at' => now()]);
        LegacyInstalls::sync($this->user->id);
        return DB::table('agent_connections')->where('user_id', $this->user->id)->where('provider', $provider)
            ->where('external_identity', $identity)->whereNull('revoked_at')->value('id');
    }

    protected function sent(string $method, string $pattern): int
    {
        return collect(Http::recorded())->filter(fn ($pair) => $pair[0]->method() === $method
            && preg_match($pattern, urldecode($pair[0]->url())))->count();
    }

    protected function decide(array $action, string $decision = 'allow')
    {
        return $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision',
            ['fingerprint' => $this->fingerprintOf($action), 'decision' => $decision]);
    }

    protected function runState(string $runId): string
    {
        return $this->getJson('/api/agents/v2/runs/'.$runId)->json('run.state');
    }
}
