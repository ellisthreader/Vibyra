<?php
namespace App\Services\CloudWorkspaces\Git;

use App\Jobs\DeliverPhoneNotification;
use App\Services\Notifications\Preferences;
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Support\Str;

/**
 * Cloud computer events -> the existing phone notification outbox. No new push
 * provider: this writes a work event, an inbox item and one delivery per device,
 * and `DeliverPhoneNotification` applies consent, quiet hours and presence.
 * The lock-screen title is a fixed string per type; the VM's title/body (clipped)
 * are only visible inside the authenticated inbox item.
 */
final class CloudEvents
{
    /** type => [work phase, preference category, lock-screen title, throttle seconds, item lifetime minutes] */
    public const TYPES = [
        'task.finished' => ['cloud_finished', 'replies', 'Your cloud computer finished', 60, 1440],
        'approval.needed' => ['cloud_approval', 'attention', 'Your cloud computer needs approval', 30, 60],
        'login.needed' => ['cloud_login', 'attention', 'Your cloud computer needs you to sign in', 900, 360],
        // Backend-only (Retention); the VM cannot send it.
        'retention.warning' => ['cloud_retention', 'attention', 'Your cloud computer will be removed soon', 86400, 4320],
    ];

    /** @return array{sent:bool, reason:?string, devices?:int} */
    public function send(object $workspace, string $type, string $title, string $body, ?string $sessionId = null): array
    {
        [$phase, $category, $lock, $throttle, $minutes] = self::TYPES[$type];
        if (!config('intelligence.inbox')) return ['sent' => false, 'reason' => 'disabled'];
        $user = (int) $workspace->user_id;
        if (!(bool) app(Preferences::class)->get($user)->{$category}) return ['sent' => false, 'reason' => 'preference_off'];
        if (!Cache::add('cloud-git:event:'.$workspace->id.':'.$type, 1, $throttle)) return ['sent' => false, 'reason' => 'throttled'];
        $ids = [];
        $hostId = $this->hostKey($workspace);
        DB::transaction(function () use ($workspace, $type, $title, $body, $sessionId, $hostId, $phase, $category, $lock, $minutes, $user, &$ids) {
            $eventId = DB::table('work_events')->insertGetId(['user_id' => $user, 'source' => 'cloud_computer', 'run_id' => $workspace->id,
                'fingerprint' => hash('sha256', 'cloud_computer:'.$workspace->id.':'.$type.':'.Str::uuid()), 'phase' => $phase,
                'metadata' => json_encode(['workspaceId' => $workspace->id, 'type' => $type]), 'created_at' => now(), 'published_at' => now()]);
            $itemId = (string) Str::uuid();
            DB::table('notification_items')->insert(['id' => $itemId, 'user_id' => $user, 'event_id' => $eventId, 'category' => $category,
                'title' => $lock, 'created_at' => now(), 'expires_at' => now()->addMinutes($minutes),
                'destination' => json_encode(['source' => 'cloud_computer', 'kind' => 'cloud_computer', 'runId' => $workspace->id, 'workspaceId' => $workspace->id,
                    'hostId' => $hostId, ...($sessionId !== null ? ['sessionId' => $sessionId] : []), 'event' => $type, 'detail' => ['title' => self::clip($title, 80), 'body' => self::clip($body, 240)]])]);
            foreach (DB::table('notification_devices')->where('user_id', $user)->whereNull('revoked_at')->get() as $d) {
                DB::table('notification_deliveries')->insertOrIgnore(['item_id' => $itemId, 'device_id' => $d->id, 'generation' => $d->generation,
                    'next_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
                $ids[] = DB::table('notification_deliveries')->where('item_id', $itemId)->where('device_id', $d->id)->value('id');
            }
        });
        if (config('intelligence.push')) foreach ($ids as $id) DeliverPhoneNotification::dispatch($id)->afterCommit();
        return ['sent' => true, 'reason' => null, 'devices' => count($ids)];
    }

    /** The computer's Noise key (what the phone connects by) while its host row is live. */
    private function hostKey(object $w): ?string
    {
        return $w->remote_host_id ? DB::table('remote_hosts')->where('id', $w->remote_host_id)->whereNull('revoked_at')->value('host_id') : null;
    }

    /** Still true while the computer exists for its owner; the item's own expiry does the rest. */
    public function current(object $item, object $event): bool
    {
        return DB::table('cloud_workspaces')->where('id', $event->run_id)->where('user_id', $item->user_id)->exists();
    }

    private static function clip(string $s, int $n): string
    {
        return mb_strcut(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? ''), 0, $n, 'UTF-8');
    }
}
