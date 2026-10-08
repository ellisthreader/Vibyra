<?php

namespace Tests\Feature\Teams;

use App\Models\{OrganizationMember, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Hash};
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

/** Roadmap Part 13: every ID token and domain validation, against the local mock OIDC provider. */
class TeamsSsoTokenTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootSso();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class); // throttling has its own test
        $this->configureSso();
    }

    private function expectFailure(string $code, ?callable $tamper = null, string $email = 'ada@acme.test'): void
    {
        $r = $this->ssoSignIn($email, 'idp-user-1', $tamper);
        $this->assertSame($code, $this->errorOf($r));
        $this->assertGuest();
    }

    public function test_the_domain_claim_is_enforced_on_the_email(): void
    {
        $this->person('ada@acme.test');
        // The start refuses an address outside a verified SSO domain, and a look-alike.
        foreach (['ada@other.test', 'ada@acme.test.evil.test', 'ada@sub.acme.test', 'ada@notacme.test', 'nobody'] as $email) {
            $this->postJson('/web-api/auth/sso/start', ['email' => $email])->assertStatus(404);
        }
        // A provider that asserts an address on another domain is refused at the token, whatever the person typed.
        $this->idp->claims = ['email' => 'ada@evil.test'];
        $this->expectFailure('sso_domain');
        $this->idp->claims = ['email' => 'ada@acme.test.evil.test'];
        $this->expectFailure('sso_domain');
    }

    public function test_every_id_token_validation_fails_closed(): void
    {
        $this->person('ada@acme.test');
        $bad = [
            'wrong issuer' => [['iss' => 'https://evil.example.test'], 'sso_claims'],
            'issuer with a trailing slash' => [['iss' => $this->idp->issuer.'/'], 'sso_claims'],
            'wrong audience' => [['aud' => 'someone-else'], 'sso_claims'],
            'audience list without us' => [['aud' => ['a', 'b']], 'sso_claims'],
            'several audiences without azp' => [['aud' => ['vibyra-client', 'b']], 'sso_claims'],
            'wrong azp' => [['aud' => ['vibyra-client', 'b'], 'azp' => 'b'], 'sso_claims'],
            'expired' => [['exp' => time() - 3600], 'sso_claims'],
            'no exp' => [['exp' => '__omit__'], 'sso_claims'],
            'issued in the future' => [['iat' => time() + 3600], 'sso_claims'],
            'not yet valid' => [['nbf' => time() + 3600], 'sso_claims'],
            'wrong nonce' => [['nonce' => 'forged'], 'sso_claims'],
            'no nonce' => [['nonce' => '__omit__'], 'sso_claims'],
            'no subject' => [['sub' => '__omit__'], 'sso_claims'],
            'empty subject' => [['sub' => ''], 'sso_claims'],
            'no email' => [['email' => '__omit__'], 'sso_claims'],
            'malformed email' => [['email' => 'not-an-email'], 'sso_claims'],
            'unverified email' => [['email_verified' => false], 'sso_claims'],
        ];
        foreach ($bad as $name => [$claims, $code]) {
            $this->idp->claims = $claims;
            $this->app['auth']->forgetGuards();
            $this->flushSession();
            $this->assertSame($code, $this->errorOf($this->ssoSignIn('ada@acme.test')), $name);
            $this->assertGuest();
        }
        $this->assertSame(0, OrganizationMember::count() - 1, 'nobody was seated by a rejected token');
    }

    public function test_a_forged_or_wrongly_signed_token_is_refused(): void
    {
        $this->person('ada@acme.test');
        $this->idp->signWithOtherKey = true;
        $this->expectFailure('sso_token');
        $this->idp->signWithOtherKey = false;
        foreach (['none', 'HS256'] as $alg) {
            $this->idp->alg = $alg;
            $this->flushSession();
            $this->expectFailure('sso_token');
        }
        $this->idp->alg = null;
        $this->idp->headerKid = 'unknown-key';
        $this->flushSession();
        $this->expectFailure('sso_token');
        $this->assertNull($this->memberOf(\App\Models\User::where('email', 'ada@acme.test')->first()));
    }
}
