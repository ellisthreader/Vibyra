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

    public function test_dry_run_never_sends_or_records_a_delivery(): void
    {
        Mail::fake();
        User::factory()->create(['email' => 'ada@vibyra.app']);

        $this->artisan('vibyra:announce-release', ['version' => '0.1.10'])
            ->expectsOutputToContain('Dry run only')
            ->assertSuccessful();

        Mail::assertNothingSent();
        $this->assertDatabaseCount('release_announcement_deliveries', 0);
    }

    public function test_command_sends_once_per_real_account_and_renders_branded_content(): void
    {
        Mail::fake();
        config()->set('mail.default', 'array');
        $user = User::factory()->create(['name' => 'Ada Lovelace', 'email' => 'ada@vibyra.app']);
        User::factory()->create(['email' => 'fixture@example.com']);
        User::factory()->unverified()->create(['email' => 'unverified@vibyra.app']);

        $this->artisan('vibyra:announce-release', ['version' => '0.1.10', '--send' => true])
            ->expectsOutputToContain('1 account(s) are pending')
            ->assertSuccessful();
        Mail::assertSent(VibyraReleaseAnnouncement::class, fn ($mail) => $mail->hasTo($user->email)
            && $mail->envelope()->subject === 'We fixed Vibyra terminal lag — please update to 0.1.10'
            && str_contains($mail->render(), 'we’re sorry')
            && str_contains($mail->render(), 'incorrect terminal spacing')
            && str_contains($mail->render(), 'Update to Vibyra 0.1.10'));

        Mail::fake();
        $this->artisan('vibyra:announce-release', ['version' => '0.1.10', '--send' => true])
            ->expectsOutputToContain('0 account(s) are pending')
            ->assertSuccessful();
        Mail::assertNothingSent();
    }

    public function test_log_mailer_refuses_a_live_send(): void
    {
        User::factory()->create(['email' => 'ada@vibyra.app']);
        config()->set('mail.default', 'log');

        $this->artisan('vibyra:announce-release', ['version' => '0.1.10', '--send' => true])
            ->expectsOutputToContain('Delivery refused')
            ->assertFailed();
    }
}
