<?php
namespace App\Services\Notifications;
use App\Jobs\DeliverPhoneNotification;
use App\Models\AgentV2\RunEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
/**
 * Agent V2 run hooks -> inbox item + per-device outbox rows. `record` runs from
 * RunEvent::created, i.e. inside the journal append's transaction, so an event
 * and its deliveries commit or roll back together. Nothing private is copied:
 * titles are fixed strings and the destination holds only ids.
 */
final class AgentRunNotifications
{
    /** hook => [work phase, preference category, generic title, kind] */
    private const HOOKS = [
        'run.completed' => ['agent_completed', 'replies', 'Your teammate finished', 'completed'],
        'run.waiting_approval' => ['agent_approval', 'attention', 'Your teammate needs approval', 'approval'],
        'run.waiting_signin' => ['agent_signin', 'attention', 'Your teammate needs you to sign in', 'signin'],
        'run.failed' => ['agent_failed', 'attention', 'Your teammate could not finish', 'failed'],
    ];

    public static function enabled(): bool
    {
        return (bool) config('agents_v2.notifications') && (bool) config('intelligence.inbox');
    }

    public function record(RunEvent $event): void
    {
        if (!self::enabled() || !isset(self::HOOKS[$event->type])) return;
        $run = DB::table('agent_runs')->where('id', $event->run_id)->first(['id', 'user_id', 'agent_id', 'conversation_id']);
        if (!$run) return;
        [$phase, $category, $title, $kind] = self::HOOKS[$event->type];
        $actionId = $kind === 'approval' ? ($event->payload['actionId'] ?? null) : null;
        $fingerprint = hash('sha256', 'agent_run:'.$run->id.':'.$event->seq);
        DB::table('work_events')->insertOrIgnore(['user_id' => $run->user_id, 'source' => 'agent_run', 'run_id' => $run->id,
            'fingerprint' => $fingerprint, 'phase' => $phase, 'created_at' => now(), 'published_at' => now(),
            'metadata' => json_encode(['seq' => $event->seq, 'kind' => $kind, 'actionId' => is_string($actionId) ? $actionId : null])]);
        $workEvent = DB::table('work_events')->where('fingerprint', $fingerprint)->value('id');
        if (DB::table('notification_items')->where('event_id', $workEvent)->exists()) return;
        app(Preferences::class)->get((int) $run->user_id);
        $expires = $kind === 'approval'
            ? (DB::table('agent_tool_actions')->where('id', $actionId)->value('expires_at') ?? now()->addMinutes(15))
            : now()->addDay();
        $itemId = (string) Str::uuid();
        DB::table('notification_items')->insert(['id' => $itemId, 'user_id' => $run->user_id, 'event_id' => $workEvent,
            'category' => $category, 'title' => $title, 'created_at' => now(), 'expires_at' => $expires,
            'destination' => json_encode(['source' => 'agent_run', 'runId' => $run->id, 'agentId' => $run->agent_id,
                'conversationId' => $run->conversation_id, 'kind' => $kind])]);
        $ids = [];
        foreach (DB::table('notification_devices')->where('user_id', $run->user_id)->whereNull('revoked_at')->get() as $d) {
            DB::table('notification_deliveries')->insertOrIgnore(['item_id' => $itemId, 'device_id' => $d->id,
                'generation' => $d->generation, 'next_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            $ids[] = DB::table('notification_deliveries')->where('item_id', $itemId)->where('device_id', $d->id)->value('id');
        }
        // The scheduler (vibyra:observe-work) drains anything this misses.
        if (config('intelligence.push')) foreach ($ids as $id) DeliverPhoneNotification::dispatch($id)->afterCommit();
    }

    /** Whether the moment this item announced is still true. Never grants anything. */
    public function current(object $item, object $event): bool
    {
        if (!config('agents_v2.notifications')) return false;
        $status = $this->status($item, $event);
        if (!$status) return false;
        return match ($event->phase) {
            'agent_approval' => $status['runState'] === 'waiting_for_approval' && $status['actionState'] === 'pending_approval',
            'agent_signin' => $status['runState'] === 'waiting_for_signin',
            'agent_completed' => $status['runState'] === 'completed',
            'agent_failed' => $status['runState'] === 'failed',
            default => false,
        };
    }

    /** Current run/action state for the item's owner, re-read on every open. */
    public function status(object $item, ?object $event = null): ?array
    {
        $event ??= DB::table('work_events')->where('id', $item->event_id)->first();
        if (!$event || $event->source !== 'agent_run') return null;
        $run = DB::table('agent_runs')->where('id', $event->run_id)->where('user_id', $item->user_id)->first(['state']);
        if (!$run) return null;
        $actionId = json_decode($event->metadata, true)['actionId'] ?? null;
        $action = $actionId ? DB::table('agent_tool_actions')->where('id', $actionId)->where('run_id', $event->run_id)
            ->where('user_id', $item->user_id)->first(['state', 'expires_at']) : null;
        $actionState = $action?->state;
        if ($actionState === 'pending_approval' && $action->expires_at && now()->gte($action->expires_at)) $actionState = 'expired';
        return ['runState' => $run->state, 'actionId' => $action ? $actionId : null, 'actionState' => $actionState];
    }
}
