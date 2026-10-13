<?php

namespace Tests\Feature;

use App\Jobs\NotifyPublicRequest;
use App\Models\PublicRequest;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Bus, Cache, Mail, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class PublicRequestNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['mail.default' => 'array', 'mail.public_requests_to' => 'support@vibyra.net',
            'mail.from.address' => 'hello@vibyra.net', 'mail.reply_to.address' => 'support@vibyra.net']);
        Mail::purge();
    }

    private function requestRecord(array $attributes = []): PublicRequest
    {
        $record = new PublicRequest;
        $record->forceFill(['reference' => (string) Str::ulid(), 'email' => 'requester@example.com',
            'topic' => 'support', 'details' => 'Help with <a> & "quotes".\nSecond line.', ...$attributes])->save();
        return $record;
    }

    public function test_form_queues_only_a_record_id_after_saving_and_ignores_recipient_override(): void
    {
        Queue::fake();
        $this->post('/privacy/requests', ['email' => 'Person@Example.com', 'topic' => 'support',
            'to' => 'outsider@example.com'])->assertRedirect('/privacy/requests')->assertSessionHas('request_reference');
        $record = PublicRequest::query()->sole();
        Queue::assertPushedOn('notifications', NotifyPublicRequest::class,
            fn ($job) => $job->requestId === $record->id && $job->afterCommit === true);
        $this->assertStringNotContainsString($record->email, serialize(new NotifyPublicRequest($record->id)));
    }

    public function test_email_reaches_only_configured_support_with_the_requester_as_reply_to(): void
    {
        $record = $this->requestRecord();
        (new NotifyPublicRequest($record->id))->handle();
        $messages = Mail::mailer()->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $email = $messages->first()->getOriginalMessage();
        $this->assertSame(['support@vibyra.net'], array_map(fn ($a) => $a->getAddress(), $email->getTo()));
        $this->assertSame(['requester@example.com'], array_map(fn ($a) => $a->getAddress(), $email->getReplyTo()));
        $this->assertSame('hello@vibyra.net', $email->getFrom()[0]->getAddress());
        $this->assertSame([], $email->getCc());
        $this->assertSame([], $email->getBcc());
        $this->assertStringContainsString($record->reference, $email->getSubject());
        $this->assertStringContainsString('Support', $email->getSubject());
        $this->assertStringContainsString($record->details, $email->getTextBody());
        $this->assertStringContainsString($record->email, $email->getTextBody());
        $this->assertStringContainsString('have not been verified', $email->getTextBody());
        $this->assertNull($email->getHtmlBody());
        $this->assertNotNull($record->fresh()->owner_notified_at);
        $this->assertNotEmpty($record->fresh()->owner_notification_id);
    }

    public function test_duplicate_delivery_and_missing_record_do_not_send_again(): void
    {
        $record = $this->requestRecord(['details' => null]);
        $job = new NotifyPublicRequest($record->id);
        $job->handle();
        $job->handle();
        (new NotifyPublicRequest($record->id + 1))->handle();
        $messages = Mail::mailer()->getSymfonyTransport()->messages();
        $this->assertCount(1, $messages);
        $this->assertStringContainsString('(No details provided)', $messages->first()->getOriginalMessage()->getTextBody());
    }

    public function test_mail_failure_keeps_the_record_pending_and_a_retry_succeeds(): void
    {
        $record = $this->requestRecord();
        $realMail = Mail::getFacadeRoot();
        Mail::shouldReceive('to')->once()->andThrow(new \RuntimeException('private provider payload'));
        try {
            (new NotifyPublicRequest($record->id))->handle();
            $this->fail('Delivery failure must remain retryable');
        } catch (\RuntimeException $error) {
            $this->assertSame('Public request notification unavailable: '.$record->reference, $error->getMessage());
        } finally {
            Mail::swap($realMail);
        }
        $this->assertNull($record->fresh()->owner_notified_at);
        $this->assertNotNull($record->fresh()->owner_notification_attempted_at);
        $this->assertSame($record->details, $record->fresh()->details);
        (new NotifyPublicRequest($record->id))->handle();
        $this->assertNotNull($record->fresh()->owner_notified_at);
    }

    public function test_an_active_delivery_lock_leaves_the_record_for_retry(): void
    {
        $record = $this->requestRecord();
        $lock = Cache::lock('public-request-mail:'.$record->id, 60);
        $this->assertTrue($lock->get());
        try { (new NotifyPublicRequest($record->id))->handle(); }
        finally { $lock->release(); }
        $this->assertNull($record->fresh()->owner_notified_at);
        $this->assertCount(0, Mail::mailer()->getSymfonyTransport()->messages());
        (new NotifyPublicRequest($record->id))->handle();
        $this->assertNotNull($record->fresh()->owner_notified_at);
    }

    public function test_scheduled_recovery_picks_unsent_and_due_requests_only(): void
    {
        Queue::fake();
        $new = $this->requestRecord();
        $retry = $this->requestRecord(['owner_notification_attempted_at' => now()->subMinutes(6)]);
        $this->requestRecord(['owner_notification_attempted_at' => now()->subMinute()]);
        $this->requestRecord(['owner_notified_at' => now()]);
        $this->requestRecord(['status' => 'closed']);
        $this->artisan('vibyra:notify-public-requests')->assertSuccessful();
        Queue::assertPushed(NotifyPublicRequest::class, 2);
        Queue::assertPushed(NotifyPublicRequest::class, fn ($job) => $job->requestId === $new->id);
        Queue::assertPushed(NotifyPublicRequest::class, fn ($job) => $job->requestId === $retry->id);
        $event = collect(app(Schedule::class)->events())->first(fn ($event) =>
            str_contains((string) $event->command, 'vibyra:notify-public-requests'));
        $this->assertSame('* * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertTrue($event->onOneServer);
    }

    public function test_invalid_or_throttled_requests_do_not_enqueue_email(): void
    {
        Queue::fake();
        $this->post('/privacy/requests', ['email' => "x@example.com\r\nBcc: other@example.com", 'topic' => 'support'])
            ->assertSessionHasErrors('email');
        Queue::assertNothingPushed();
        for ($i = 0; $i < 4; $i++) {
            $this->post('/privacy/requests', ['email' => "person{$i}@example.com", 'topic' => 'support'])->assertRedirect();
        }
        $this->post('/privacy/requests', ['email' => 'limited@example.com', 'topic' => 'support'])->assertStatus(429);
        Queue::assertPushed(NotifyPublicRequest::class, 4);
    }

    public function test_queue_outage_does_not_lose_the_request_or_its_receipt(): void
    {
        Bus::shouldReceive('dispatch')->once()->andThrow(new \RuntimeException('Queue unavailable'));
        $this->post('/privacy/requests', ['email' => 'person@example.com', 'topic' => 'support'])
            ->assertRedirect('/privacy/requests')->assertSessionHas('request_reference');
        $record = PublicRequest::query()->sole();
        $this->assertNull($record->owner_notified_at);
        $this->assertSame('person@example.com', $record->email);
    }

    public function test_invalid_configured_recipient_leaves_a_retryable_request(): void
    {
        config(['mail.public_requests_to' => 'not-an-email']);
        $record = $this->requestRecord();
        try {
            (new NotifyPublicRequest($record->id))->handle();
            $this->fail('Invalid recipient must not be treated as delivered');
        } catch (\RuntimeException) {
            $this->assertNull($record->fresh()->owner_notified_at);
            $this->assertCount(0, Mail::mailer()->getSymfonyTransport()->messages());
        }
    }
}
