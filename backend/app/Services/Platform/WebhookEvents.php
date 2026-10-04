<?php

namespace App\Services\Platform;

use App\Jobs\DeliverPlatformWebhook;
use App\Models\AgentV2\Run;
use App\Models\WebhookEndpoint;
use App\Services\AgentRuns\RunStates;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Run state changes → queued webhook deliveries. The payload is ids and state only (never the prompt, answer, tool
 * arguments or file names). One delivery per (endpoint, event key) is enforced by a unique index, so a repeated
 * transition (lease recovery re-entering "starting") sends nothing twice. It never throws into the run's lifecycle.
 */
final class WebhookEvents
{
    private const BY_STATE = [RunStates::COMPLETED => 'run.completed', RunStates::FAILED => 'run.failed', RunStates::UNKNOWN => 'run.failed',
        RunStates::WAITING_APPROVAL => 'run.needs_approval'];

    public function runMoved(Run $run, string $from, string $to): void
    {
        $event = $to === RunStates::RUNNING && $from === RunStates::STARTING ? 'run.started' : (self::BY_STATE[$to] ?? null);
        if ($event === null || !WebhookEndpoints::enabled()) return;
        // A run can wait for approval many times; every other event happens once per run.
        $this->emit($run, $event, $event === 'run.needs_approval' ? $run->id.':'.$event.':'.$run->event_seq : $run->id.':'.$event);
    }

    public function emit(Run $run, string $event, string $key): void
    {
        try {
            $endpoints = WebhookEndpoint::query()->where('user_id', $run->user_id)->whereNull('deleted_at')->whereNull('paused_at')->get()
                ->filter(fn (WebhookEndpoint $e) => in_array($event, $e->events ?? [], true));
            foreach ($endpoints as $endpoint) {
                $id = (string) Str::uuid();
                // ON CONFLICT DO NOTHING: a duplicate must not raise inside the caller's transaction (PostgreSQL would abort it).
                $made = DB::table('webhook_deliveries')->insertOrIgnore(['id' => $id, 'endpoint_id' => $endpoint->id, 'user_id' => $run->user_id, 'event' => $event,
                    'event_key' => $key, 'created_at' => now(), 'state' => 'pending', 'attempts' => 0, 'payload' => json_encode(['id' => $id, 'type' => $event,
                        'createdAt' => now()->toIso8601String(), 'data' => ['runId' => $run->id, 'agentId' => $run->agent_id, 'state' => $run->state]])]);
                if ($made === 0) continue;
                DeliverPlatformWebhook::dispatch($id)->afterCommit();
            }
        } catch (Throwable $e) {
            report($e);
        }
    }
}
