<?php

namespace App\Services\Billing;

use App\Models\StripeWebhookEvent;
use App\Models\StripeWebhookObjectState;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Stripe\Event;
use Throwable;

class StripeWebhookProcessor
{
    public function process(Event $event, Closure $handler): string
    {
        [$objectType, $objectId] = $this->objectIdentity($event);
        $record = $this->eventRecord($event, $objectType, $objectId);
        if (in_array($record->status, ['processed', 'ignored'], true)) {
            return 'duplicate';
        }
        $this->ensureObjectState($objectType, $objectId);

        $record->forceFill([
            'attempts' => (int) $record->attempts + 1,
            'status' => 'processing',
            'last_error' => null,
        ])->save();

        try {
            return DB::transaction(function () use (
                $event,
                $handler,
                $record,
                $objectType,
                $objectId
            ): string {
                $lockedRecord = StripeWebhookEvent::whereKey($record->id)->lockForUpdate()->firstOrFail();
                if (in_array($lockedRecord->status, ['processed', 'ignored'], true)) {
                    return 'duplicate';
                }

                $state = $this->lockedObjectState($objectType, $objectId);
                $createdAt = Carbon::createFromTimestamp((int) ($event->created ?? time()));

                if ($state && $state->last_event_created_at?->isAfter($createdAt)) {
                    $lockedRecord->forceFill([
                        'status' => 'ignored',
                        'processed_at' => now(),
                        'last_error' => 'stale_event',
                    ])->save();

                    return 'stale';
                }

                $handler();

                $state->forceFill([
                    'last_event_id' => (string) $event->id,
                    'last_event_created_at' => $createdAt,
                ])->save();
                $lockedRecord->forceFill([
                    'status' => 'processed',
                    'processed_at' => now(),
                    'last_error' => null,
                ])->save();

                return 'processed';
            }, 3);
        } catch (Throwable $exception) {
            StripeWebhookEvent::whereKey($record->id)->update([
                'status' => 'failed',
                'last_error' => mb_substr($exception->getMessage(), 0, 1000),
            ]);
            throw $exception;
        }
    }

    private function eventRecord(Event $event, string $objectType, string $objectId): StripeWebhookEvent
    {
        try {
            return StripeWebhookEvent::firstOrCreate([
                'event_id' => (string) $event->id,
            ], [
                'type' => (string) $event->type,
                'object_type' => $objectType,
                'object_id' => $objectId,
                'event_created_at' => Carbon::createFromTimestamp((int) ($event->created ?? time())),
                'status' => 'pending',
                'attempts' => 0,
            ]);
        } catch (QueryException $exception) {
            $record = StripeWebhookEvent::where('event_id', (string) $event->id)->first();
            if ($record) {
                return $record;
            }
            throw $exception;
        }
    }

    private function lockedObjectState(
        string $objectType,
        string $objectId
    ): StripeWebhookObjectState {
        return StripeWebhookObjectState::where([
            'object_type' => $objectType,
            'object_id' => $objectId,
        ])->lockForUpdate()->firstOrFail();
    }

    private function ensureObjectState(string $objectType, string $objectId): void
    {
        StripeWebhookObjectState::query()->insertOrIgnore([
            'object_type' => $objectType,
            'object_id' => $objectId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Order subscription lifecycle events against the subscription even when
     * Stripe delivers them through checkout or invoice objects.
     *
     * @return array{string, string}
     */
    private function objectIdentity(Event $event): array
    {
        $object = $event->data->object;
        $subscriptionId = trim((string) ($object->subscription ?? ''));
        if ($subscriptionId !== '') {
            return ['subscription', $subscriptionId];
        }
        if (str_starts_with((string) $event->type, 'customer.subscription.')) {
            return ['subscription', (string) ($object->id ?? $event->id)];
        }

        $objectType = trim((string) ($object->object ?? 'event_object')) ?: 'event_object';
        $objectId = trim((string) ($object->id ?? $event->id)) ?: (string) $event->id;

        return [$objectType, $objectId];
    }
}
