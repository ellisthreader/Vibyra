<?php

namespace App\Services\AgentTriggers;

use App\Models\AgentV2\Trigger;
use App\Services\AgentRuns\Access;
use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\Crypt;
use Stripe\Exception\SignatureVerificationException;
use Stripe\WebhookSignature;

/**
 * Provider webhooks for triggers. The signature is checked with the trigger's own secret
 * over the raw body before anything is parsed or stored. Dedupe keys: the SHA-256 of GitHub's
 * signed body (a redelivery repeats it) and Stripe's signed event ID.
 */
final class Webhooks
{
    public function __construct(private readonly TriggerIntake $intake, private readonly Access $access) {}

    public function github(string $triggerId, string $raw, array $headers): array
    {
        $trigger = $this->trigger($triggerId, ['github.issue', 'github.pull_request']);
        $given = (string) ($headers['signature'] ?? '');
        $expected = 'sha256='.hash_hmac('sha256', $raw, $this->secret($trigger));
        if (!hash_equals($expected, $given)) ApiError::throw(401, 'invalid_signature', 'The webhook signature did not match.');
        $event = (string) ($headers['event'] ?? '');
        if ($event === 'ping') return ['ok' => true, 'state' => 'pong'];
        $delivery = (string) ($headers['delivery'] ?? '');
        if (!preg_match('/^[A-Za-z0-9-]{8,100}$/D', $delivery)) ApiError::throw(422, 'delivery_required', 'Missing delivery ID.');
        $body = json_decode($raw, true);
        if (!is_array($body)) ApiError::throw(422, 'invalid_payload', 'The webhook body is not JSON.');
        $match = TriggerKinds::github($trigger->kind, $event, $body, $trigger->filter ?? []);
        // F-11: the delivery header is not covered by the signature, so the event is keyed by the signed body. A genuine
        // redelivery repeats the body and dedupes; replaying one signed body under fresh delivery ids cannot start more runs.
        return $this->deliver($trigger, 'github:'.hash('sha256', $raw), $match);
    }

    public function stripe(string $triggerId, string $raw, string $signature): array
    {
        $trigger = $this->trigger($triggerId, ['stripe.event']);
        try {
            WebhookSignature::verifyHeader($raw, $signature, $this->secret($trigger), 300);
        } catch (SignatureVerificationException) {
            ApiError::throw(401, 'invalid_signature', 'The webhook signature did not match.');
        }
        $event = json_decode($raw, true);
        if (!is_array($event) || !is_string($event['id'] ?? null)) ApiError::throw(422, 'invalid_payload', 'The webhook body is not a Stripe event.');
        return $this->deliver($trigger, 'stripe:'.$event['id'], TriggerKinds::stripe($event, $trigger->filter ?? []));
    }

    private function deliver(Trigger $trigger, string $key, ?array $match): array
    {
        if (!$match) return ['ok' => true, 'state' => 'ignored'];
        if (!$this->access->allows($trigger->user_id)) return ['ok' => true, 'state' => 'ignored', 'reason' => 'agents_v2_unavailable'];
        [$event, $created] = $this->intake->receive($trigger, $key, $match[0], $match[1]);
        return ['ok' => true, 'state' => $event->state, 'duplicate' => !$created, 'eventId' => $event->id];
    }

    private function trigger(string $id, array $kinds): Trigger
    {
        $trigger = Trigger::query()->whereKey($id)->whereNull('deleted_at')->whereIn('kind', $kinds)->first();
        if (!$trigger || !$trigger->secret) ApiError::throw(404, 'trigger_not_found', 'Unknown trigger.');
        return $trigger;
    }

    private function secret(Trigger $trigger): string
    {
        return Crypt::decryptString($trigger->secret);
    }
}
