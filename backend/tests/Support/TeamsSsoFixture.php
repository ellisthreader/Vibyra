<?php

namespace Tests\Support;

use App\Models\{Organization, User};
use App\Services\Teams\Sso\Domains;
use Illuminate\Testing\TestResponse;

/** Teams SSO tests: a mock OIDC provider, a fake DNS, a configured team and a "browser" that goes start, provider, callback. */
trait TeamsSsoFixture
{
    use TeamsFixture;

    protected MockOidcProvider $idp;
    protected array $txt = [];
    protected Organization $org;
    protected User $owner;

    protected function bootSso(): void
    {
        $this->bootTeams();
        $this->idp = new MockOidcProvider;
        $this->idp->install();
        $this->app->instance(Domains::class, new Domains(fn (string $name) => $this->txt[$name] ?? []));
        [$this->org, $this->owner] = $this->team($this->person('owner@acme.test'), 'Acme');
    }

    protected function ssoBody(array $over = []): array
    {
        return $over + ['issuer' => $this->idp->issuer, 'clientId' => $this->idp->clientId, 'clientSecret' => $this->idp->secret, 'domain' => 'acme.test'];
    }

    /** Owner configures, proves the domain by DNS and switches SSO on (optionally required). */
    protected function configureSso(bool $enable = true, bool $require = false): void
    {
        $this->actingAs($this->owner)->putJson('/web-api/team/sso', $this->ssoBody())->assertOk();
        $value = $this->getJson('/web-api/team')->json('sso.dns.value');
        $this->txt['_vibyra-verify.acme.test'] = [$value];
        $this->postJson('/web-api/team/sso/verify')->assertOk()->assertJsonPath('sso.domainVerified', true);
        if ($enable) $this->postJson('/web-api/team/sso/enable', ['enabled' => true, 'requireSso' => $require])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->flushSession();
    }

    /** The browser: start with a work email, follow to the provider, come back to the callback. */
    protected function ssoSignIn(string $email, string $sub = 'idp-user-1', ?callable $tamper = null): TestResponse
    {
        $start = $this->postJson('/web-api/auth/sso/start', ['email' => $email])->assertOk();
        $url = $this->idp->authorize($start->json('authUrl'), $email, $sub);
        $this->assertNotNull($url, 'the provider refused the authorization request');
        if ($tamper) $url = $tamper($url) ?? $url;
        return $this->get($url);
    }

    protected function errorOf(TestResponse $r): ?string
    {
        $r->assertRedirect();
        parse_str((string) parse_url($r->headers->get('Location'), PHP_URL_QUERY), $q);
        return $q['sso_error'] ?? null;
    }
}
