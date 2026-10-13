<?php

namespace App\Jobs;

use App\Mail\PublicRequestReceived;
use App\Models\PublicRequest;
use Illuminate\Contracts\Queue\{ShouldBeUnique, ShouldQueue};
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\{Cache, Mail};

class NotifyPublicRequest implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 5;
    public int $timeout = 20;
    public int $uniqueFor = 3600;

    public function __construct(public int $requestId)
    {
        $this->onQueue('notifications');
    }

    public function uniqueId(): string { return (string) $this->requestId; }
    public function backoff(): array { return [30, 120, 300, 900]; }

    public function handle(): void
    {
        Cache::lock('public-request-mail:'.$this->requestId, 60)->get(function (): void {
            $record = PublicRequest::query()->find($this->requestId);
            if (! $record || $record->owner_notified_at) return;

            $record->forceFill(['owner_notification_attempted_at' => now()])->save();
            try {
                $recipient = config('mail.public_requests_to');
                if (! is_string($recipient) || ! filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
                    throw new \RuntimeException('Invalid support recipient');
                }
                $sent = Mail::to($recipient)->send(new PublicRequestReceived($record));
                if (! $sent) throw new \RuntimeException('Mail delivery was cancelled');
                $record->forceFill([
                    'owner_notified_at' => now(),
                    'owner_notification_id' => $sent->getMessageId(),
                ])->save();
            } catch (\Throwable) {
                // Avoid recording email addresses, request bodies or provider credentials in failed-job logs.
                throw new \RuntimeException('Public request notification unavailable: '.$record->reference);
            }
        });
    }
}
