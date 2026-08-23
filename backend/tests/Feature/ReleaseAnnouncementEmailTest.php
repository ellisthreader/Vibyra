<?php

namespace Tests\Feature;

use App\Mail\VibyraReleaseAnnouncement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ReleaseAnnouncementEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_sends_once_per_real_account_and_renders_branded_content(): void
    {
        Mail::fake();
        config()->set('mail.default', 'array');
        $user = User::factory()->create(['name' => 'Ada Lovelace', 'email' => 'ada@vibyra.app']);
        User::factory()->create(['email' => 'fixture@example.com']);

        $this->artisan('vibyra:announce-release', ['version' => '0.1.7', '--send' => true])
            ->expectsOutputToContain('1 account(s) are pending')
            ->assertSuccessful();
        Mail::assertSent(VibyraReleaseAnnouncement::class, fn ($mail) => $mail->hasTo($user->email)
            && str_contains($mail->render(), 'report a bug')
            && str_contains($mail->render(), 'Download Vibyra 0.1.7'));

        Mail::fake();
        $this->artisan('vibyra:announce-release', ['version' => '0.1.7', '--send' => true])
            ->expectsOutputToContain('0 account(s) are pending')
            ->assertSuccessful();
        Mail::assertNothingSent();
    }

    public function test_log_mailer_refuses_a_live_send(): void
    {
        User::factory()->create(['email' => 'ada@vibyra.app']);
        config()->set('mail.default', 'log');

        $this->artisan('vibyra:announce-release', ['version' => '0.1.7', '--send' => true])
            ->expectsOutputToContain('Delivery refused')
            ->assertFailed();
    }
}
