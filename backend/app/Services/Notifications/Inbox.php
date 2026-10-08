<?php
namespace App\Services\Notifications;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
final class Inbox
{
    public function publish(int $eventId): void
    {
        if (!config('intelligence.inbox')) return;
        DB::transaction(function () use ($eventId) {
            $event = DB::table('work_events')->where('id', $eventId)->lockForUpdate()->first();
            if (!$event || $event->published_at) return;
            $p = DB::table('notification_preferences')->where('user_id', $event->user_id)->first();
            $category = match ($event->phase) {
                'approval_pending', 'question_pending', 'failed', 'budget_limit', 'step_limit', 'outcome_unknown' => 'attention',
                'reply_ready' => 'replies', 'possible_loop', 'possible_blocker' => 'advisories', default => null,
            };
            if ($p && $category && $event->created_at >= $p->activated_at) {
                $data = json_decode($event->metadata, true);
                $id = (string) Str::uuid();
                DB::table('notification_items')->insertOrIgnore(['id' => $id, 'user_id' => $event->user_id,
                    'event_id' => $event->id, 'category' => $category,
                    'title' => $category === 'replies' ? 'Your reply is ready' : ($category === 'advisories' ? 'Your task may need a review' : 'Vibyra needs your attention'),
                    'destination' => json_encode(['source' => $event->source, 'runId' => $event->run_id,
                        ...array_intersect_key($data, array_flip(['chatId', 'agentId', 'turnId', 'hostId', 'sessionId']))]),
                    'created_at' => now(), 'expires_at' => now()->addHours($category === 'replies' ? 24 : 1)]);
                $item = DB::table('notification_items')->where('event_id', $event->id)->first();
                foreach (DB::table('notification_devices')->where('user_id', $event->user_id)->whereNull('revoked_at')->get() as $d) {
                    DB::table('notification_deliveries')->insertOrIgnore(['item_id' => $item->id, 'device_id' => $d->id,
                        'generation' => $d->generation, 'next_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
                }
            }
            DB::table('work_events')->where('id', $eventId)->update(['published_at' => now()]);
        });
    }
    public function current(object $item): bool
    {
        if ($item->read_at || now()->gte($item->expires_at)) return false;
        $event = DB::table('work_events')->where('id', $item->event_id)->first();
        if (!$event) return false;
        $progress = DB::table('work_progress')->where('source', $event->source)->where('run_id', $event->run_id)->first();
        $data = json_decode($event->metadata, true);
        $advisory = in_array($event->phase, ['possible_loop','possible_blocker']);
        if (!$progress || $progress->event_id != ($advisory ? ($data['evidenceEvent'] ?? 0) : $event->id)) return false;
        if ($advisory && (!in_array(config('intelligence.jev_mode'), ['shadow','active']) || !config('intelligence.events') || config('intelligence.progress_mode') !== 'advisory'
            || !DB::table('notification_preferences')->where('user_id', $item->user_id)->value('smart'))) return false;
        if ($advisory) {
            $assessment = $progress->assessment ? json_decode($progress->assessment, true) : [];
            if (($assessment['label'] ?? null) !== $event->phase || now()->diffInMinutes(\Illuminate\Support\Carbon::parse($assessment['assessedAt'] ?? '2000-01-01'), true) > 10) return false;
        }
        if ($event->source === 'host_conversation') {
            if (!config('intelligence.host_events')) return false;
            $data = json_decode($event->metadata, true);
            if (!DB::table('remote_hosts')->where('user_id', $item->user_id)->where('host_id', $data['hostId'])->whereNull('revoked_at')->exists()) return false;
            $latest = DB::table('host_notification_cursors')->where('user_id', $item->user_id)
                ->where('host_id', $data['hostId'])->where('session', $data['sessionId'])->orderByDesc('observed_at')->orderByDesc('id')->first();
            if (!$latest || $latest->generation !== $data['generation'] || $latest->sequence != $data['sequence']) return false;
            if (now()->diffInSeconds(\Illuminate\Support\Carbon::parse($data['occurredAt']), true) > 120) return false;
        }
        if ($event->source === 'cloud_turn') {
            $turn = DB::table('vibes_turns')->where('id', $event->run_id)->where('user_id', $item->user_id)->first();
            if (!$turn) return false;
            $actual = app(\App\Services\Progress\TurnObservation::class)->read($turn);
            if ($actual['phase'] !== ($advisory ? $data['runtimePhase'] : $event->phase)) return false;
            if (($data['pending'] ?? []) !== $actual['pending'] || ($data['unknown'] ?? []) !== $actual['unknown']) return false;
            if ($event->phase === 'approval_pending') {
                $pending = DB::table('vibes_tools')->whereIn('id', $actual['pending'])->where('created_at', '>', now()->subMinutes(15))->exists();
                if (!$pending || $turn->settled_at || $turn->cancel_requested) return false;
            }
        }
        return true;
    }
    /** Provider queues must not outlive the source's useful attention window. */
    public function deliveryTtl(object $item): int
    {
        $expires = \Illuminate\Support\Carbon::parse($item->expires_at);
        $event = DB::table('work_events')->where('id', $item->event_id)->first();
        if (!$event) return 0;
        $data = json_decode($event->metadata, true);
        if ($event->source === 'host_conversation') {
            $expires = $expires->min(\Illuminate\Support\Carbon::parse($data['occurredAt'])->addSeconds(120));
        } elseif ($event->phase === 'approval_pending') {
            $created = DB::table('vibes_tools')->whereIn('id', $data['pending'] ?? [])->min('created_at');
            if (!$created) return 0;
            $expires = $expires->min(\Illuminate\Support\Carbon::parse($created)->addMinutes(15));
        }
        return max(0, min(3600, (int) now()->diffInSeconds($expires, false)));
    }
    public function payload(object $item): array
    {
        return ['id' => $item->id, 'title' => $item->title, 'category' => $item->category,
            'destination' => json_decode($item->destination, true), 'createdAt' => $item->created_at,
            'read' => $item->read_at !== null, 'actionable' => $this->current($item)];
    }
}
