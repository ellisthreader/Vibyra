<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Trigger, TriggerEvent};
use Illuminate\Support\Facades\DB;

/** Called only by authenticated provider intake while its exact trigger row is locked. */
final class FollowUpSignals
{
    public static function record(Trigger $trigger, TriggerEvent $event, ?array $observedAuthority = null): void
    {
        if (!config('agents_v2.work_enabled') || in_array($event->reason, ['own_activity', 'paused', 'trigger_deleted', 'trigger_changed'], true)) return;
        $authority = FollowUpAuthority::snapshot($trigger, true);
        if (!$authority || ($observedAuthority !== null && $authority !== $observedAuthority)) return;
        $subject = self::subject($trigger, $event);
        if ($subject === null) return;
        DB::table('agent_work_signals')->insertOrIgnore(['user_id' => $trigger->user_id, 'trigger_id' => $trigger->id,
            'trigger_revision' => $trigger->revision, 'authority_hash' => FollowUpAuthority::hash($authority), 'event_id' => $event->id, 'subject' => $subject, 'created_at' => now()]);
    }

    public static function subject(Trigger $trigger, TriggerEvent $event): ?string
    {
        if ($event->subject && is_string($event->subject)) return mb_substr($event->subject, 0, 191);
        $s = $event->summary ?? [];
        if ($trigger->kind === 'gmail.message' && is_string($s['threadId'] ?? null) && preg_match('/^[A-Za-z0-9_-]{1,100}$/D', $s['threadId']))
            return 'gmail:thread:'.$s['threadId'];
        if ($trigger->kind === 'calendar.event_soon' && is_string($s['calendarId'] ?? null) && is_string($s['eventId'] ?? null))
            return 'calendar:'.substr(hash('sha256', $s['calendarId']), 0, 16).':'.mb_substr($s['eventId'], 0, 100);
        return null;
    }
}
