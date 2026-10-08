<?php

namespace Tests\Feature\Teams;

use App\Models\OrganizationSso;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB};
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

/** Roadmap Part 13: the owner's SSO card (issuer discovery, encrypted secret, domain claim, enabling, requiring) against the mock provider. */
class TeamsSsoSettingsTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSso();
    }

    public function test_the_secret_is_encrypted_at_rest_and_never_returned(): void
    {
        $this->actingAs($this->owner)->putJson('/web-api/team/sso', $this->ssoBody())->assertOk()
            ->assertJsonPath('sso.issuer', $this->idp->issuer)->assertJsonPath('sso.hasSecret', true)->assertJsonPath('sso.domainVerified', false)
            ->assertJsonPath('sso.enabled', false)->assertJsonPath('sso.dns.name', '_vibyra-verify.acme.test');
        $raw = DB::table('organization_sso')->first();
        $this->assertNotSame($this->idp->secret, $raw->client_secret);
        $this->assertSame($this->idp->secret, Crypt::decryptString($raw->client_secret));
        $this->assertStringNotContainsString($this->idp->secret, $this->getJson('/web-api/team')->getContent());
        $this->assertArrayNotHasKey('client_secret', OrganizationSso::first()->toArray());
        // Updating without a secret keeps the stored one.
        $this->putJson('/web-api/team/sso', $this->ssoBody(['clientSecret' => null, 'clientId' => 'other']))->assertOk();
        $this->assertSame($this->idp->secret, Crypt::decryptString(DB::table('organization_sso')->value('client_secret')));
        $this->assertContains('team.sso_configured', array_column($this->events($this->owner), 'event'));
    }

    public function test_a_first_save_needs_a_secret_and_inputs_are_validated(): void
    {
        $this->actingAs($this->owner);
        $this->putJson('/web-api/team/sso', $this->ssoBody(['clientSecret' => null]))->assertStatus(422)->assertJsonPath('code', 'secret_required');
        $this->putJson('/web-api/team/sso', $this->ssoBody(['domain' => 'gmail.com']))->assertStatus(422)->assertJsonPath('code', 'invalid_domain');
        foreach (['not a domain', 'localhost', 'a..b.com', 'https://acme.test', '-x.com'] as $bad) $this->putJson('/web-api/team/sso', $this->ssoBody(['domain' => $bad]))->assertStatus(422);
        $this->putJson('/web-api/team/sso', ['issuer' => $this->idp->issuer])->assertStatus(422);
        $this->assertSame(0, OrganizationSso::count());
    }

    public function test_discovery_problems_are_refused_when_saving(): void
    {
        $this->actingAs($this->owner);
        $cases = [
            'http issuer' => [['issuer' => 'http://idp.example.test'], null],
            'issuer with a query' => [['issuer' => 'https://idp.example.test?x=1'], null],
            'document names another issuer' => [[], ['issuer' => 'https://evil.test']],
            'no token endpoint' => [[], ['token_endpoint' => '']],
            'http token endpoint' => [[], ['token_endpoint' => 'http://idp.example.test/token']],
            'no PKCE S256' => [[], ['code_challenge_methods_supported' => ['plain']]],
            'no code flow' => [[], ['response_types_supported' => ['token']]],
            'not RS256' => [[], ['id_token_signing_alg_values_supported' => ['ES256']]],
            'unsupported client auth' => [[], ['token_endpoint_auth_methods_supported' => ['private_key_jwt']]],
        ];
        foreach ($cases as $name => [$body, $discovery]) {
            $this->idp->discovery = $discovery ?? [];
            $this->putJson('/web-api/team/sso', $this->ssoBody($body))->assertStatus(422)->assertJsonPath('code', 'sso_provider', $name);
        }
        $this->assertSame(0, OrganizationSso::count());
    }

    public function test_an_issuer_on_a_private_address_is_blocked_before_any_request(): void
    {
        $this->app->instance(\App\Services\Mcp\EndpointPolicy::class, new \App\Services\Mcp\EndpointPolicy(fn () => ['127.0.0.1']));
        $this->actingAs($this->owner)->putJson('/web-api/team/sso', $this->ssoBody())->assertStatus(422)->assertJsonPath('code', 'sso_provider');
        $this->assertSame([], $this->idp->log, 'no request left the application');
        $this->app->instance(\App\Services\Mcp\EndpointPolicy::class, new \App\Services\Mcp\EndpointPolicy(fn () => ['169.254.169.254']));
        $this->putJson('/web-api/team/sso', $this->ssoBody())->assertStatus(422);
        $this->assertSame([], $this->idp->log);
    }

    public function test_the_domain_is_claimed_by_a_dns_txt_record_and_the_claim_is_logged(): void
    {
        $this->actingAs($this->owner)->putJson('/web-api/team/sso', $this->ssoBody())->assertOk();
        $this->postJson('/web-api/team/sso/verify')->assertStatus(422)->assertJsonPath('code', 'dns_not_found');
        $this->txt['_vibyra-verify.acme.test'] = ['vibyra-verify=wrong', 'v=spf1 -all'];
        $this->postJson('/web-api/team/sso/verify')->assertStatus(422);
        $this->postJson('/web-api/team/sso/enable', ['enabled' => true])->assertStatus(409)->assertJsonPath('code', 'domain_unverified');
        $this->txt['_vibyra-verify.acme.test'][] = $this->getJson('/web-api/team')->json('sso.dns.value');
        $this->postJson('/web-api/team/sso/verify')->assertOk()->assertJsonPath('sso.domainVerified', true)->assertJsonPath('sso.domainMethod', 'dns')->assertJsonPath('sso.dns', null);
        $this->assertSame('acme.test', OrganizationSso::first()->verified_domain);
        $log = $this->events($this->owner, 'team.sso_domain_verified');
        $this->assertCount(1, $log);
        $this->assertSame(['org' => 'Acme', 'domain' => 'acme.test', 'method' => 'dns'], $log[0]['detail']);
    }

    public function test_a_domain_can_be_verified_for_one_team_only(): void
    {
        $this->configureSso(false);
        [$other, $otherOwner] = $this->team($this->person(), 'Rival');
        $this->actingAs($otherOwner)->putJson('/web-api/team/sso', $this->ssoBody())->assertOk();
        $this->txt['_vibyra-verify.acme.test'] = [$this->getJson('/web-api/team')->json('sso.dns.value')];
        $this->postJson('/web-api/team/sso/verify')->assertStatus(409)->assertJsonPath('code', 'domain_taken');
        $this->assertNull(OrganizationSso::find($other->id)->verified_domain);
    }

    public function test_the_manual_confirmation_is_an_operator_command_recorded_in_every_owners_log(): void
    {
        $this->actingAs($this->owner)->putJson('/web-api/team/sso', $this->ssoBody())->assertOk();
        // A team owner has no route to do it for themselves.
        $this->assertContains($this->postJson('/web-api/team/sso/confirm')->status(), [404, 405]);
        $co = $this->person();
        $this->seat($this->org, $co, 'owner');
        $this->artisan('vibyra:team-confirm-domain', ['organization' => 'missing', '--operator' => 'ops'])->assertFailed();
        $this->artisan('vibyra:team-confirm-domain', ['organization' => $this->org->id])->assertFailed();
        $this->artisan('vibyra:team-confirm-domain', ['organization' => $this->org->id, '--operator' => 'ops@vibyra.test', '--no-interaction' => true])->assertSuccessful();
        $this->assertSame('manual', OrganizationSso::first()->domain_method);
        foreach ([$this->owner, $co] as $o) {
            $log = $this->events($o, 'team.sso_domain_verified');
            $this->assertCount(1, $log);
            $this->assertSame('manual', $log[0]['detail']['method']);
            $this->assertSame('ops@vibyra.test', $log[0]['detail']['operator']);
        }
    }

    public function test_changing_the_domain_or_issuer_switches_sso_off_and_unverifies(): void
    {
        $this->configureSso(true, true);
        $this->actingAs($this->owner)->putJson('/web-api/team/sso', $this->ssoBody(['domain' => 'acme.io']))->assertOk()
            ->assertJsonPath('sso.enabled', false)->assertJsonPath('sso.requireSso', false)->assertJsonPath('sso.domainVerified', false);
        $this->assertNull(OrganizationSso::first()->verified_domain);
        $this->assertSame('acme.io', OrganizationSso::first()->domain);
    }

    public function test_requiring_sso_needs_it_enabled_and_turning_it_off_clears_the_requirement(): void
    {
        $this->configureSso(false);
        $this->actingAs($this->owner)->postJson('/web-api/team/sso/enable', ['enabled' => false, 'requireSso' => true])->assertOk()->assertJsonPath('sso.requireSso', false);
        $this->postJson('/web-api/team/sso/enable', ['enabled' => true, 'requireSso' => true])->assertOk()->assertJsonPath('sso.requireSso', true);
        $this->postJson('/web-api/team/sso/enable', ['enabled' => false])->assertOk()->assertJsonPath('sso.requireSso', false);
        $events = array_column($this->events($this->owner), 'event');
        $this->assertContains('team.sso_enabled', $events);
        $this->assertContains('team.sso_required', $events);
        $this->assertContains('team.sso_disabled', $events);
        $this->deleteJson('/web-api/team/sso')->assertOk()->assertJsonPath('sso.configured', false);
        $this->assertSame(0, OrganizationSso::count());
        $this->postJson('/web-api/team/sso/enable', ['enabled' => true])->assertNotFound();
    }

    public function test_a_member_sees_no_sso_card_at_all(): void
    {
        $this->configureSso();
        $bob = $this->person();
        $this->seat($this->org, $bob);
        $this->actingAs($bob)->getJson('/web-api/team')->assertJsonPath('sso', ['visible' => false]);
    }
}
