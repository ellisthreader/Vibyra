<?php

namespace Tests\Feature;

use App\Services\Auth\ProviderAccountException;
use App\Services\Auth\ProviderAccountService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class LegalSignupAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['legal.enforce_signup_acceptance' => true]);
    }

    public function test_new_email_account_needs_current_terms_adult_and_uk_assertions(): void
    {
        $account = ['email' => 'legal@example.test', 'password' => 'safe-password'];
        $this->postJson('/api/auth/signup', $account)->assertStatus(422);
        $this->postJson('/api/auth/signup', [
            ...$account, ...$this->acceptance(), 'countryCode' => 'US',
        ])->assertStatus(422);
        $this->assertDatabaseMissing('users', ['email' => $account['email']]);

        $this->postJson('/api/auth/signup', [...$account, ...$this->acceptance()])
            ->assertCreated()->assertJsonPath('user.email', $account['email']);

        $this->assertDatabaseHas('users', ['email' => $account['email'], 'country_code' => 'GB']);
        $this->assertDatabaseHas('legal_acceptances', [
            'terms_version' => '2026-09-28', 'privacy_version' => '2026-09-28',
            'country_code' => 'GB', 'surface' => 'app',
        ]);
    }

    public function test_new_provider_account_needs_acceptance_but_existing_login_does_not(): void
    {
        $service = app(ProviderAccountService::class);
        $identity = ['subject' => 'provider-legal-1', 'email' => 'provider-legal@example.test', 'name' => 'Legal User'];
        try {
            $service->resolveWithStatus(Request::create('/', 'POST'), 'google', $identity);
            $this->fail('A new provider account must require legal acceptance.');
        } catch (ProviderAccountException $error) {
            $this->assertSame(422, $error->status);
        }

        $created = $service->resolveWithStatus(
            Request::create('/', 'POST', [...$this->acceptance(), 'deviceName' => 'Vibyra Website']),
            'google', $identity
        );
        $this->assertTrue($created['created']);
        $this->assertDatabaseHas('legal_acceptances', [
            'user_id' => $created['user']->id, 'surface' => 'website', 'country_code' => 'GB',
        ]);

        $again = $service->resolveWithStatus(Request::create('/', 'POST'), 'google', $identity);
        $this->assertFalse($again['created']);
        $this->assertSame($created['user']->id, $again['user']->id);
        $this->assertDatabaseCount('legal_acceptances', 1);
    }

    public function test_website_signup_records_same_terms_and_adult_assertion(): void
    {
        $account = ['name' => 'Website Legal', 'email' => 'web-legal@example.test', 'password' => 'safe-password'];
        $this->postJson('/web-api/auth/signup', $account)->assertStatus(422);
        $this->postJson('/web-api/auth/signup', [...$account, ...$this->acceptance()])
            ->assertCreated()->assertJsonPath('user.email', $account['email']);

        $this->assertDatabaseHas('users', ['email' => $account['email'], 'country_code' => 'GB']);
        $this->assertDatabaseHas('legal_acceptances', ['surface' => 'website', 'country_code' => 'GB']);
    }

    private function acceptance(): array
    {
        return [
            'termsVersion' => '2026-09-28',
            'termsAccepted' => true,
            'adultConfirmed' => true,
            'countryCode' => 'GB',
        ];
    }
}
