<?php
namespace App\Services\CloudWorkspaces;

/** Current-machine identity is verified before this policy; the configured default image is not runtime proof. */
final class FlyStopBudget
{
    public static function timeout(object $w, ?array $machine): ?string
    {
        $state = $machine === null ? 'absent' : ($machine['state'] ?? 'unknown');
        if (in_array($state, ['stopped', 'destroyed', 'absent'], true)) return null;
        $orderly = in_array($state, ['started', 'stopping'], true) && ($w->kind ?? null) === 'computer' && ($w->state ?? null) === 'stopping'
            && !empty($w->ready_at) && !empty($w->stop_requested_at)
            && in_array($w->stop_reason ?? null, ['user_stop', 'idle'], true) && self::reviewedImage($machine);
        // A lost POST reply is reconciled by inspection. Do not reset an orderly stop already in progress.
        if ($orderly && $state === 'stopping') return null;
        // Paired runtime watchdog:37s including final sync; expiry still escalates independently. HTTP stays12s.
        return $orderly ? '40s' : '10s';
    }

    private static function reviewedImage(array $machine): bool
    {
        $image = $machine['config']['image'] ?? null; $digest = $machine['image_ref']['digest'] ?? null;
        if (!is_string($digest)) return false; // Desired config alone is not resolved instance identity.
        foreach ((array) config('cloud_workspaces.orderly_stop_images', []) as $allowed) {
            if (!is_string($allowed) || !preg_match('/^[^\s@]+@(sha256:[a-f0-9]{64})$/D', $allowed, $match)) continue;
            // Present config must be exactly immutable; reject tags and disagreements with the resolved digest.
            if ($image !== null && $image !== $allowed) continue;
            if ($digest === $match[1]) return true;
        }
        return false;
    }
}
