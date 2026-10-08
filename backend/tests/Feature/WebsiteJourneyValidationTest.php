<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class WebsiteJourneyValidationTest extends TestCase
{
    use RefreshDatabase;

    public static function invalidFields(): array
    {
        return [
            'long name' => ['name', str_repeat('n', 256)],
            'long email' => ['email', str_repeat('e', 250).'@example.test'],
            'name array' => ['name', ['not a string']],
            'email array' => ['email', ['not a string']],
            'password array' => ['password', ['not a string']],
            'short password' => ['password', 'short'],
        ];
    }

    #[DataProvider('invalidFields')]
    public function test_invalid_signup_fields_return_validation_without_creating_an_account(string $field, mixed $value): void
    {
        $this->postJson('/web-api/auth/signup', array_replace([
            'name' => 'Website Visitor', 'email' => 'journey@example.test', 'password' => 'secret123',
        ], [$field => $value]))->assertUnprocessable()->assertJsonValidationErrors($field);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_signup']);
        $this->assertGuest();
    }

    public function test_signup_normalizes_email_and_rejects_duplicate_without_another_event(): void
    {
        $fields = ['name' => 'Website Visitor', 'email' => ' Journey@Example.Test ', 'password' => 'secret123'];
        $this->postJson('/web-api/auth/signup', $fields)->assertCreated()
            ->assertJsonPath('user.email', 'journey@example.test');
        $this->get('/account')->assertOk();
        $this->get('/downloads')->assertOk();
        $this->postJson('/web-api/auth/signup', $fields)->assertStatus(409)
            ->assertJsonPath('error', 'An account already exists for that email. Log in instead.');
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('analytics_events', 1);
    }

    public function test_all_funnel_entry_pages_and_legal_destinations_are_public(): void
    {
        foreach (['/', '/signup', '/login', '/downloads', '/account/downloads', '/billing',
            '/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/refunds', '/legal/community',
            '/legal/accessibility', '/privacy/requests'] as $path) {
            $this->get($path)->assertOk();
        }
    }
}
