<?php
namespace App\Services\LiveStatus;

use App\Jobs\DeliverPhoneNotification;
use App\Services\Notifications\Preferences;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Mac terminals and chats -> phone notifications, from two consecutive menu-bar snapshots
 * (names and states only). Runs inside the Mac request's transaction with the snapshot row
 * locked, before the new snapshot overwrites the old one.
 *
 * - A `t:`/`c:` key new in `attention` -> "needs you" (at most once per key per 3 minutes).
 * - A key new in `recent` that was working or waiting before -> finished / failed.
 * - No events from a first snapshot, for `m:` (Agent V2 covers teammates) or the `phone` row.
 * - A key that leaves `attention` resolves its "needs you" item (marked read; the badge drops).
 * - More than two pushable events in one snapshot -> one summary push; every item stays in the inbox.
 */
final class MacEvents
{
    private const COOLDOWN = 180;
    private const NAMES = ['claude' => 'Claude', 'codex' => 'Codex', 'gemini' => 'Gemini'];
    /** kind => [phase, category, level, lifetime minutes, order in a summary] */
    private const KINDS = [
        'approval' => ['mac_approval', 'attention', 'time-sensitive', 60, 0],
        'failed' => ['mac_failed', 'failures', 'active', 360, 1],
        'completed' => ['mac_completed', 'replies', 'active', 360, 2],
    ];

    public static function enabled(): bool
    {
        return (bool) config('intelligence.mac_events') && (bool) config('intelligence.inbox');
    }

    /** @param ?object $previous the stored live_status_snapshots row (locked), null on the first report */
    public function record(int $userId, ?object $previous, array $next, string $macName): void
    {
        if (!self::enabled() || !$previous) return;
        $before = json_decode((string) $previous->snapshot, true) ?: [];
        $wasWaiting = self::byKey($before['attention'] ?? []);
        $wasBusy = self::byKey($before['working'] ?? []) + $wasWaiting;
        $wasRecent = self::byKey($before['recent'] ?? []);
        $waiting = self::byKey($next['attention'] ?? []);
        $stamp = (string) $previous->updated_at;

        foreach (array_diff_key($wasWaiting, $waiting) as $key => $_) $this->resolve($userId, $key);

        $found = [];
        foreach ($waiting as $key => $row) {
            if (isset($wasWaiting[$key]) || !self::watched($key)) continue;
            if ($this->coolingDown($userId, $key)) continue;
            $found[] = ['approval', $row];
        }
        foreach (self::byKey($next['recent'] ?? []) as $key => $row) {
            // Only a real transition: a heartbeat, a restart's reused pane id or an old recent row never notify.
            if (isset($wasRecent[$key]) || !isset($wasBusy[$key]) || !self::watched($key)) continue;
            $was = $wasBusy[$key];
            $found[] = [($row['outcome'] ?? 'done') === 'failed' ? 'failed' : 'completed',
                ['key' => $key, 'title' => $row['title'] ?? $was['title'] ?? '', 'project' => $was['project'] ?? '', 'agent' => $was['agent'] ?? '']];
        }
        if (!$found) return;
        usort($found, fn ($a, $b) => self::KINDS[$a[0]][4] <=> self::KINDS[$b[0]][4]);

        $prefs = app(Preferences::class)->get($userId);
        $pushable = array_values(array_filter($found, fn ($e) => (bool) ($prefs->{self::KINDS[$e[0]][1]} ?? false)));
        $summary = count($pushable) > 2 ? self::summary($pushable, $macName) : null;
        // The summary rides on the most urgent pushable event; the others stay in the inbox only.
        $lead = $summary ? array_search($pushable[0], $found, true) : null;
        $devices = DB::table('notification_devices')->where('user_id', $userId)->whereNull('revoked_at')->get();
        foreach ($found as $i => [$kind, $row]) {
            $this->write($userId, $kind, $row, $stamp, $i === $lead ? $summary : null, $devices, $summary !== null && $i !== $lead);
        }
    }

    /** "Needs you" is current while its key is still waiting; finished/failed until they expire. */
    public function current(object $item, object $event): bool
    {
        if (!self::enabled()) return false;
        if ($event->phase !== 'mac_approval') return true;
        $key = json_decode((string) $event->metadata, true)['key'] ?? null;
        $snap = DB::table('live_status_snapshots')->where('user_id', $item->user_id)->value('snapshot');
        $waiting = self::byKey((json_decode((string) $snap, true) ?: [])['attention'] ?? []);
        return is_string($key) && isset($waiting[$key]);
    }

    private function write(int $userId, string $kind, array $row, string $stamp, ?array $summary, $devices, bool $summarized): void
    {
        [$phase, $category, $level, $minutes] = self::KINDS[$kind];
        $key = Card::text($row['key'], 120);
        $fingerprint = hash('sha256', "mac:$userId:$key:$phase:$stamp");
        $inserted = DB::table('work_events')->insertOrIgnore(['user_id' => $userId, 'source' => 'mac', 'run_id' => 'mac:'.$key,
            'fingerprint' => $fingerprint, 'phase' => $phase, 'created_at' => now(), 'published_at' => now(),
            'metadata' => json_encode(['key' => $key, 'kind' => $kind, ...($summary ? ['summary' => $summary] : [])])]);
        if (!$inserted) return;
        $eventId = DB::table('work_events')->where('fingerprint', $fingerprint)->value('id');
        $title = Card::text($row['title'] ?? '', 40);
        $project = Card::text($row['project'] ?? '', 28);
        $agent = Card::agent($row['agent'] ?? '');
        $name = $agent ? (self::NAMES[$agent] ?? ucfirst($agent)) : null;
        $who = $name ?? ($title !== '' ? $title : 'An agent');
        $itemId = (string) Str::uuid();
        DB::table('notification_items')->insert(['id' => $itemId, 'user_id' => $userId, 'event_id' => $eventId, 'category' => $category,
            'title' => Card::text($who.' '.match ($kind) { 'approval' => 'needs you', 'failed' => 'stopped with an error', default => 'finished' }, 120),
            'body' => self::body($name ? $title : '', $project),
            'thread' => substr('mac:'.$key, 0, 64), 'level' => $level,
            'destination' => json_encode(['source' => 'mac', 'runId' => 'mac:'.$key, 'key' => $key, 'kind' => $kind,
                'title' => $title, 'project' => $project, 'agent' => $agent ?? '']),
            'created_at' => now(), 'expires_at' => now()->addMinutes($minutes)]);
        $ids = [];
        foreach ($devices as $d) {
            DB::table('notification_deliveries')->insertOrIgnore(['item_id' => $itemId, 'device_id' => $d->id, 'generation' => $d->generation,
                'next_at' => now(), 'created_at' => now(), 'updated_at' => now(),
                ...($summarized ? ['state' => 'suppressed', 'error' => 'Summarized'] : [])]);
            if (!$summarized) $ids[] = DB::table('notification_deliveries')->where('item_id', $itemId)->where('device_id', $d->id)->value('id');
        }
        // The scheduler (vibyra:observe-work) drains anything this misses.
        if (config('intelligence.push')) foreach ($ids as $id) DeliverPhoneNotification::dispatch($id)->afterCommit();
    }

    /** The waiting item is answered: it leaves the badge and is no longer offered. */
    private function resolve(int $userId, string $key): void
    {
        $events = DB::table('work_events')->where('user_id', $userId)->where('source', 'mac')->where('run_id', 'mac:'.$key)
            ->where('phase', 'mac_approval')->pluck('id');
        if ($events->isNotEmpty()) DB::table('notification_items')->whereIn('event_id', $events)->whereNull('read_at')->update(['read_at' => now()]);
    }

    /** A key that flaps between waiting and working is announced once per cool-down; its item reopens instead. */
    private function coolingDown(int $userId, string $key): bool
    {
        $recent = DB::table('work_events')->where('user_id', $userId)->where('source', 'mac')->where('run_id', 'mac:'.$key)
            ->where('phase', 'mac_approval')->where('created_at', '>', now()->subSeconds(self::COOLDOWN))->orderByDesc('id')->value('id');
        if (!$recent) return false;
        DB::table('notification_items')->where('event_id', $recent)->update(['read_at' => null]);
        return true;
    }

    private static function summary(array $events, string $macName): array
    {
        $n = count($events);
        $kinds = array_unique(array_column($events, 0));
        $title = count($kinds) === 1 ? match ($kinds[0]) {
            'approval' => "$n agents need you", 'failed' => "$n tasks stopped with an error", default => "$n tasks finished",
        } : "$n updates from ".(Card::text($macName, 40) ?: 'your Mac');
        $names = array_values(array_filter(array_map(fn ($e) => Card::text($e[1]['title'] ?? '', 40), $events)));
        return ['title' => $title, 'body' => Card::text(implode(', ', $names), 160),
            'level' => in_array('approval', $kinds, true) ? 'time-sensitive' : 'active'];
    }

    private static function body(string $title, string $project): ?string
    {
        $line = implode(' · ', array_filter([$title, $project], fn ($v) => $v !== ''));
        return $line === '' ? null : Card::text($line, 160);
    }

    /** Only Mac terminals (`t:`) and agent chats (`c:`). */
    private static function watched(string $key): bool
    {
        return str_starts_with($key, 't:') || str_starts_with($key, 'c:');
    }

    /** @return array<string,array> */
    private static function byKey(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) if (is_array($row) && is_string($row['key'] ?? null)) $out[$row['key']] ??= $row;
        return $out;
    }
}
