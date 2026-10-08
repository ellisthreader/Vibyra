<?php

namespace Tests\Feature;

use App\Models\PublicRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

class PublicRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_public_form_records_a_request_and_gives_a_reference(): void
    {
        $this->get('/privacy/requests?topic=refund')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertSee('name="topic"', false)
            ->assertSee('value="refund" selected', false)
            ->assertDontSee('mailto:support@vibyra.app', false);

        $response = $this->post('/privacy/requests', [
            'email' => 'Person@Example.com',
            'topic' => 'privacy_access',
            'details' => 'Please send a copy of my account data.',
        ])->assertRedirect('/privacy/requests');

        $stored = PublicRequest::query()->sole();
        $this->assertSame('person@example.com', $stored->email);
        $this->assertSame('new', $stored->status);
        $this->assertSame(26, strlen($stored->reference));
        $response->assertSessionHas('request_reference', $stored->reference);
    }

    public function test_invalid_fields_are_rejected_without_storing_a_request(): void
    {
        $this->from('/privacy/requests')->post('/privacy/requests', [
            'email' => 'invalid',
            'topic' => 'delete_everything_now',
            'details' => str_repeat('x', 501),
        ])->assertRedirect('/privacy/requests')->assertSessionHasErrors(['email', 'topic', 'details']);

        $this->assertDatabaseCount('public_requests', 0);
    }

    public function test_the_public_form_is_rate_limited(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->withHeader('X-Forwarded-For', "198.51.100.{$i}")
                ->post('/privacy/requests', ['email' => "person{$i}@example.com", 'topic' => 'security'])
                ->assertRedirect('/privacy/requests');
        }
        $this->withHeader('X-Forwarded-For', '198.51.100.88')
            ->post('/privacy/requests', ['email' => 'sixth@example.com', 'topic' => 'security'])
            ->assertStatus(429);
        $this->assertDatabaseCount('public_requests', 5);
    }

    public function test_public_form_limits_normalized_email_across_ips(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.'.($i + 1)])
                ->post('/privacy/requests', [
                    'email' => $i % 2 === 0 ? 'Person@Example.com' : 'person@example.com',
                    'topic' => 'privacy_access',
                ])->assertRedirect('/privacy/requests');
        }
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.20'])
            ->post('/privacy/requests', ['email' => 'PERSON@example.com', 'topic' => 'privacy_access'])
            ->assertStatus(429);
        $this->assertDatabaseCount('public_requests', 10);
    }

    public function test_operator_can_export_and_mark_a_request_for_review(): void
    {
        $record = PublicRequest::query()->create([
            'reference' => (string) Str::ulid(),
            'email' => 'requester@example.com',
            'topic' => 'accessibility',
            'details' => '=IMPORTXML("https://example.com","//data")',
        ]);

        $this->assertSame(0, Artisan::call('vibyra:requests', ['--format' => 'csv']));
        $output = Artisan::output();
        $this->assertStringContainsString('reference,received_at,topic,status,email,details', $output);
        $this->assertStringContainsString($record->reference, $output);
        $this->assertStringContainsString('requester@example.com', $output);
        $this->assertStringContainsString("'=IMPORTXML", $output);

        $this->assertSame(0, Artisan::call('vibyra:requests', ['--set-status' => $record->reference.':reviewing']));
        $this->assertDatabaseHas('public_requests', ['reference' => $record->reference, 'status' => 'reviewing']);
    }

    public function test_closed_requests_are_pruned_after_three_years(): void
    {
        foreach ([
            ['email' => 'old@example.com', 'status' => 'closed', 'closed_at' => now()->subYears(3)->subDay()],
            ['email' => 'recent@example.com', 'status' => 'closed', 'closed_at' => now()->subYears(3)->addDay()],
            ['email' => 'open@example.com', 'status' => 'new', 'closed_at' => null],
        ] as $entry) {
            PublicRequest::query()->create(['reference' => (string) Str::ulid(), 'topic' => 'privacy_access', ...$entry]);
        }

        $this->artisan('model:prune', ['--model' => [PublicRequest::class]])->assertExitCode(0);
        $this->assertDatabaseMissing('public_requests', ['email' => 'old@example.com']);
        $this->assertDatabaseHas('public_requests', ['email' => 'recent@example.com']);
        $this->assertDatabaseHas('public_requests', ['email' => 'open@example.com']);
        $scheduled = collect(app(Schedule::class)->events())->first(
            fn ($event) => str_contains((string) $event->command, PublicRequest::class)
        );
        $this->assertNotNull($scheduled);
    }
}
