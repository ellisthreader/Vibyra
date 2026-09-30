<?php

namespace Tests\Feature;

use App\Http\Middleware\AgentV2Credentials;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

/** F-30 (security review 2026-09-30): every Agent V2 route is behind a credential door unless it is on this short public list. */
class AgentV2RouteAuthTest extends TestCase
{
    /** Called by GitHub/Stripe servers (signed per trigger), by a browser returning from a provider (single-use state, bound cookie), or by a server fetching our client metadata. */
    private const PUBLIC = ['api/agents/v2/hooks/github/{trigger}', 'api/agents/v2/hooks/stripe/{trigger}', 'api/agents/v2/mcp/callback',
        'api/agents/v2/mcp/client-metadata.json', 'api/agents/v2/composio/callback'];

    private function agentV2Routes(): array
    {
        return array_values(array_filter(Route::getRoutes()->getRoutes(), fn ($r) => str_starts_with($r->uri(), 'api/agents/v2')));
    }

    public function test_every_non_public_route_passes_the_credential_door(): void
    {
        $open = [];
        foreach ($this->agentV2Routes() as $route) {
            $door = collect($route->gatherMiddleware())->first(fn ($m) => is_string($m) && str_starts_with($m, AgentV2Credentials::class.':'));
            if ($door === null) $open[] = $route->uri();
            else $this->assertSame(str_contains($route->uri(), 'runner/{runtime}') ? ':runner' : ':user', substr($door, strlen(AgentV2Credentials::class)), $route->uri());
        }
        $this->assertEqualsCanonicalizing(self::PUBLIC, array_values(array_unique($open)),
            'A route without the credential door must be deliberately public: add it to PUBLIC only if it authenticates another way.');
    }

    public function test_a_request_with_no_credentials_never_reaches_a_handler(): void
    {
        $checked = 0;
        foreach ($this->agentV2Routes() as $route) {
            if (in_array($route->uri(), self::PUBLIC, true)) continue;
            $uri = preg_replace_callback('/\{(\w+)\??\}/', fn ($m) => match ($m[1]) {
                'provider' => 'gmail', 'toolkit' => 'airtable', 'key' => 'inbox_helper', default => (string) Str::uuid()}, $route->uri());
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $status = $this->call($method, '/'.$uri)->getStatusCode();
                $expected = str_contains($route->uri(), 'runner/{runtime}') ? 403 : 401;
                $this->assertSame($expected, $status, $method.' '.$uri);
                $checked++;
            }
        }
        $this->assertGreaterThan(60, $checked);
    }

    public function test_a_runner_key_never_opens_a_person_route_and_a_session_never_opens_a_runner_route(): void
    {
        $this->getJson('/api/agents/v2/runs?agentId='.Str::uuid(), ['Authorization' => 'Bearer x', 'X-Vibyra-Runner-Key' => str_repeat('k', 64)])
            ->assertStatus(403)->assertJsonPath('code', 'runner_credential_refused');
        $this->postJson('/api/agents/v2/runner/'.Str::uuid().'/claim', [], ['Authorization' => 'Bearer x'])->assertStatus(403)->assertJsonPath('code', 'invalid_runner_key');
    }
}
