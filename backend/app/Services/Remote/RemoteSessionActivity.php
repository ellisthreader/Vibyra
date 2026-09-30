<?php

namespace App\Services\Remote;

use App\Models\RemoteSession;
use Illuminate\Support\Carbon;

/** Relay frame activity is metadata; WebSocket pings and lease checks are not activity. */
class RemoteSessionActivity
{
    public function renew(RemoteSession $session, ?int $activityAt): bool
    {
        $last = $session->last_activity_at?->timestamp;
        $now = now()->timestamp;
        $idle = max(60, min(1800, (int) config('remote_security.session_idle_seconds', 1800)));
        if ($last === null) return false;
        if ($activityAt !== null && ($activityAt > $now || $activityAt < $session->admitted_at->timestamp)) return false;
        // A newer message cannot revive a session after a full idle interval.
        if ($activityAt !== null && $activityAt > $last && $activityAt - $last < $idle) {
            $session->forceFill(['last_activity_at' => Carbon::createFromTimestampUTC($activityAt)])->save();
            $last = $activityAt;
        }
        if ($now - $last < $idle) return true;
        $session->forceFill(['status' => 'EXPIRED', 'ended_at' => now()])->save();
        return false;
    }
}
