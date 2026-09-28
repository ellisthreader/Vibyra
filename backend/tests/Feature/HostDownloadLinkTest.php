<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\HostDownloadLink;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class HostDownloadLinkTest extends TestCase
{
    use RefreshDatabase;

    private function signUp(string $email): string
    {
        return $this->postJson('/api/auth/signup', [
            'name' => 'Host Link User',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');
    }

    public function test_it_emails_the_download_link_to_the_signed_in_account(): void
    {
        Notification::fake();
        $token = $this->signUp('host-link@example.test');

        $this->postJson('/api/account/host-link', [], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJson(['ok' => true, 'email' => 'host-link@example.test']);

        Notification::assertSentTo(User::where('email', 'host-link@example.test')->firstOrFail(), HostDownloadLink::class);
    }

    // The address is the account's own, never the request's, so this endpoint
    // cannot be turned into a way to mail a link to someone else.
    public function test_it_ignores_any_email_supplied_by_the_caller(): void
    {
        Notification::fake();
        $token = $this->signUp('owner@example.test');

        $this->postJson('/api/account/host-link', ['email' => 'stranger@example.test'],
            ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJson(['email' => 'owner@example.test']);

        Notification::assertNothingSentTo(User::make(['email' => 'stranger@example.test']));
    }

    // Pairing never required an account, so the setup step has to work for a guest.
    public function test_a_guest_can_send_the_link_to_an_address_they_type(): void
    {
        Notification::fake();

        $this->postJson('/api/account/host-link', ['email' => 'Guest@Example.test'])
            ->assertOk()
            ->assertJson(['ok' => true, 'email' => 'guest@example.test']);

        Notification::assertSentOnDemand(HostDownloadLink::class,
            fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'guest@example.test');
    }

    public function test_a_guest_without_a_valid_address_is_told_so(): void
    {
        Notification::fake();

        $this->postJson('/api/account/host-link')->assertStatus(422);
        $this->postJson('/api/account/host-link', ['email' => 'not-an-email'])->assertStatus(422);

        Notification::assertNothingSent();
    }

    public function test_a_guest_cannot_bombard_one_address(): void
    {
        Notification::fake();

        $this->postJson('/api/account/host-link', ['email' => 'target@example.test'])->assertOk();
        $this->postJson('/api/account/host-link', ['email' => 'target@example.test'])->assertOk();
        $this->postJson('/api/account/host-link', ['email' => 'target@example.test'])->assertStatus(429);

        Notification::assertSentTimes(HostDownloadLink::class, 2);
    }

    public function test_it_stops_a_burst_of_requests(): void
    {
        Notification::fake();
        $token = $this->signUp('burst@example.test');
        $headers = ['Authorization' => "Bearer {$token}"];

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->postJson('/api/account/host-link', [], $headers)->assertOk();
        }
        $this->postJson('/api/account/host-link', [], $headers)->assertStatus(429);

        // Signing up sends its own verification email, so count this notification only.
        Notification::assertSentTimes(HostDownloadLink::class, 3);
    }
}
