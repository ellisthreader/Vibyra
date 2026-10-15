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
        'task.failed' => ['cloud_task_failed', 'attention', 'A task on your cloud computer failed', 60, 1440],
        // Backend-only (Retention); the VM cannot send it.
        'retention.warning' => ['cloud_retention', 'attention', 'Your cloud computer will be removed soon', 86400, 4320],
    ];

    /** @return array{sent:bool, reason:?string, devices?:int} */
    public function send(object $workspace, string $type, string $title, string $body, ?string $sessionId = null, array $extra = [], ?string $scope = null): array
    {
        [$phase, $category, $lock, $throttle, $minutes] = self::TYPES[$type];
        if (!config('intelligence.inbox')) return ['sent' => false, 'reason' => 'disabled'];
        $user = (int) $workspace->user_id;
        $preferences = app(Preferences::class);
        if (!$preferences->allows($preferences->get($user), $category, $phase)) return ['sent' => false, 'reason' => 'preference_off'];
        if (!Cache::add('cloud-git:event:'.$workspace->id.':'.$type.($scope !== null ? ':'.$scope : ''), 1, $throttle)) return ['sent' => false, 'reason' => 'throttled'];
        $ids = [];
        $hostId = $this->hostKey($workspace);
        DB::transaction(function () use ($workspace, $type, $title, $body, $sessionId, $extra, $hostId, $phase, $category, $lock, $minutes, $user, &$ids) {
            $eventId = DB::table('work_events')->insertGetId(['user_id' => $user, 'source' => 'cloud_computer', 'run_id' => $workspace->id,
                'fingerprint' => hash('sha256', 'cloud_computer:'.$workspace->id.':'.$type.':'.Str::uuid()), 'phase' => $phase,
                'metadata' => json_encode(['workspaceId' => $workspace->id, 'type' => $type,
                    ...(isset($extra['agentSession']) ? ['runtimeGeneration' => (int) $workspace->generation] : [])]), 'created_at' => now(), 'published_at' => now()]);
            $itemId = (string) Str::uuid();
            DB::table('notification_items')->insert(['id' => $itemId, 'user_id' => $user, 'event_id' => $eventId, 'category' => $category,
                'title' => $lock, 'created_at' => now(), 'expires_at' => now()->addMinutes($minutes),
                'destination' => json_encode([...$extra, 'source' => 'cloud_computer', 'kind' => 'cloud_computer', 'runId' => $workspace->id, 'workspaceId' => $workspace->id,
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
        if (!DB::table('cloud_workspaces')->where('id', $event->run_id)->where('user_id', $item->user_id)->exists()) return false;
        $destination = json_decode((string) $item->destination, true) ?: [];
        if (!array_key_exists('agentSession', $destination)) return true; // Existing non-conversation Cloud notifications keep their contract.
        $session = $destination['agentSession'];
        if (!is_array($session) || !is_string($session['provider'] ?? null) || !is_string($session['id'] ?? null)) return false;
        $metadata = json_decode((string) $event->metadata, true) ?: [];
        $source = (object) ['workspace_id' => $event->run_id, 'user_id' => $item->user_id,
            'runtime_generation' => $metadata['runtimeGeneration'] ?? null, 'project' => $destination['project'] ?? ''];
        if (!app(\App\Services\CloudComputer\Activity\EventAuthority::class)->deliveryCurrent($source)) return false;
        if ($event->phase !== 'cloud_approval') return true;
        return app(\App\Services\CloudComputer\Activity\ActivityFeed::class)->latestPhase((int) $item->user_id, $session['provider'], $session['id']) === 'waiting';
    }

    private static function clip(string $s, int $n): string
    {
        return mb_strcut(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? ''), 0, $n, 'UTF-8');
    }
}
