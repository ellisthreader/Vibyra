<?php

namespace App\Services\AgentTriggers;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\RuntimeBinding;
use App\Models\AgentV2\Trigger;
use App\Models\AgentV2\TriggerEvent;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Grants;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Saved triggers. GitHub webhook secrets are generated here and shown once; Stripe's
 * signing secret is pasted from the Stripe endpoint (at create or later by PATCH; hooks 404 until then). Poll triggers (Gmail, Calendar)
 * need a connection this teammate already has a read grant on.
 */
final class Triggers
{
    private const READS = ['gmail' => 'gmail_search', 'google_calendar' => 'google_calendar_list_events'];

    public function __construct(private readonly Grants $grants) {}

    /** @return array{0: Trigger, 1: ?string} the trigger and a newly generated secret to show once */
    public function create(int $userId, array $data): array
    {
        $agent = $this->grants->agent($userId, $data['agentId']);
        if (Trigger::query()->where('user_id', $userId)->whereNull('deleted_at')->count() >= (int) config('agents_v2.max_triggers', 25))
            ApiError::throw(409, 'trigger_limit', 'This account has the most triggers it can keep. Delete one first.');
        $kind = $data['kind'];
        $filter = TriggerKinds::normalize($kind, $data['filter'] ?? []);
        $connection = $this->connection($userId, $agent->id, $kind, $data['connectionId'] ?? null);
        $shown = null;
        $secret = match ($kind) {
            'github.issue', 'github.pull_request' => $shown = Str::random(40),
            // Stripe issues the secret only after the endpoint (whose URL has this ID) exists: PATCH it in later.
            'stripe.event' => isset($data['signingSecret']) ? $this->stripeSecret($data['signingSecret']) : null,
            default => null,
        };
        $trigger = Trigger::query()->create(['user_id' => $userId, 'agent_id' => $agent->id, 'kind' => $kind,
            'connection_id' => $connection, 'filter' => $filter, 'prompt_template' => $this->template($data['promptTemplate'] ?? ''),
            'rate_per_hour' => (int) ($data['ratePerHour'] ?? 10), 'runtime_binding_id' => $this->runtime($userId, $data['runtimeId'] ?? null),
            'secret' => $secret ? Crypt::encryptString($secret) : null, 'revision' => 1]);
        return [$trigger, $shown];
    }

    public function update(int $userId, string $id, array $data): Trigger
    {
        return DB::transaction(function () use ($userId, $id, $data) {
            $t = $this->find($userId, $id, true);
            if ((int) $data['revision'] !== $t->revision)
                ApiError::throw(409, 'stale_revision', 'This trigger changed elsewhere. Reload it and try again.');
            $values = ['revision' => $t->revision + 1];
            if (array_key_exists('filter', $data)) $values['filter'] = TriggerKinds::normalize($t->kind, $data['filter']);
            if (array_key_exists('promptTemplate', $data)) $values['prompt_template'] = $this->template($data['promptTemplate']);
            if (array_key_exists('ratePerHour', $data)) $values['rate_per_hour'] = (int) $data['ratePerHour'];
            if (array_key_exists('runtimeId', $data)) $values['runtime_binding_id'] = $this->runtime($userId, $data['runtimeId']);
            if (array_key_exists('signingSecret', $data) && $t->kind === 'stripe.event')
                $values['secret'] = Crypt::encryptString($this->stripeSecret($data['signingSecret']));
            $t->forceFill($values)->save();
            return $t;
        });
    }

    public function pause(int $userId, string $id, bool $paused): Trigger
    {
        $t = $this->find($userId, $id);
        $t->forceFill(['paused_at' => $paused ? ($t->paused_at ?? now()) : null])->save();
        return $t;
    }

    public function delete(int $userId, string $id): void
    {
        $this->find($userId, $id)->forceFill(['deleted_at' => now(), 'secret' => null])->save();
    }

    public function find(int $userId, string $id, bool $lock = false): Trigger
    {
        $q = Trigger::query()->where('user_id', $userId)->whereKey($id)->whereNull('deleted_at');
        $t = ($lock ? $q->lockForUpdate() : $q)->first();
        if (!$t) ApiError::throw(404, 'trigger_not_found', 'That trigger does not exist.');
        return $t;
    }

    /** @return Trigger[] */
    public function list(int $userId, ?string $agentId): array
    {
        return Trigger::query()->where('user_id', $userId)->whereNull('deleted_at')
            ->when($agentId, fn ($q) => $q->where('agent_id', $agentId))->orderBy('created_at')->limit(100)->get()->all();
    }

    /** @return TriggerEvent[] newest first */
    public function events(int $userId, string $id, int $limit): array
    {
        $t = Trigger::query()->where('user_id', $userId)->whereKey($id)->first();
        if (!$t) ApiError::throw(404, 'trigger_not_found', 'That trigger does not exist.');
        return TriggerEvent::query()->where('trigger_id', $t->id)->orderByDesc('created_at')->orderByDesc('id')
            ->limit(max(1, min(100, $limit)))->get()->all();
    }

    public function payload(Trigger $t): array
    {
        $hook = in_array($t->kind, ['github.issue', 'github.pull_request', 'stripe.event'], true)
            ? url('/api/agents/v2/hooks/'.explode('.', $t->kind)[0].'/'.$t->id) : null;
        return ['id' => $t->id, 'agentId' => $t->agent_id, 'kind' => $t->kind, 'connectionId' => $t->connection_id,
            'filter' => $t->filter, 'promptTemplate' => $t->prompt_template, 'ratePerHour' => $t->rate_per_hour,
            'runtimeId' => $t->runtime_binding_id, 'revision' => $t->revision, 'paused' => $t->paused_at !== null,
            'webhookUrl' => $hook, 'lastError' => $t->last_error, 'polledAt' => $t->polled_at?->toIso8601String(),
            'createdAt' => $t->created_at?->toIso8601String()];
    }

    public function eventPayload(TriggerEvent $e): array
    {
        return ['id' => $e->id, 'triggerId' => $e->trigger_id, 'eventKey' => $e->event_key, 'type' => $e->event_type,
            'state' => $e->state, 'reason' => $e->reason, 'runId' => $e->run_id, 'summary' => (object) ($e->summary ?? []),
            'createdAt' => $e->created_at?->toIso8601String()];
    }

    private function connection(int $userId, string $agentId, string $kind, ?string $id): ?string
    {
        $provider = TriggerKinds::provider($kind);
        if (!$provider) return null;
        $row = $id ? Connection::query()->where('user_id', $userId)->whereKey($id)->whereNull('revoked_at')->first() : null;
        if (!$row || $row->provider !== $provider)
            ApiError::throw(404, 'connection_not_found', 'Choose a connected '.$provider.' account for this trigger.');
        $granted = collect($this->grants->active($userId, $agentId))
            ->first(fn ($g) => $g->connection_id === $row->id && in_array(self::READS[$provider], $g->operations ?? [], true));
        if (!$granted) ApiError::throw(409, 'not_granted', 'Let this teammate read that account first.');
        return $row->id;
    }

    private function runtime(int $userId, ?string $id): ?string
    {
        if ($id && !RuntimeBinding::query()->where('user_id', $userId)->whereKey($id)->whereNull('revoked_at')->exists())
            ApiError::throw(404, 'runtime_not_found', 'That AI account binding does not exist.');
        return $id;
    }

    private function template(mixed $text): string
    {
        if (!is_string($text) || trim($text) === '') ApiError::throw(422, 'empty_prompt', 'Write what the teammate should do.');
        return $text;
    }

    private function stripeSecret(mixed $secret): string
    {
        if (!is_string($secret) || !preg_match('/^whsec_[A-Za-z0-9]{16,128}$/D', $secret))
            ApiError::throw(422, 'signing_secret_required', 'Paste the Stripe endpoint signing secret (whsec_…).');
        return $secret;
    }
}
