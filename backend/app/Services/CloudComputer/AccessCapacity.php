<?php
namespace App\Services\CloudComputer;

/**
 * `capacity` for GET /access and the state object, read from what already limits Vibyra Cloud. There is no concurrency
 * limit on sessions today, so `sessions.limit` is null rather than an invented number.
 */
class AccessCapacity
{
    /** One cloud computer per account (Computers::create). */
    public const COMPUTER_LIMIT = 1;

    /** Cloud projects per computer (the cap in Projects::queue / Projects::report). */
    public const PROJECT_LIMIT = 100;

    public function payload(int $user): array
    {
        $w = app(Computers::class)->find($user);
        $retention = app(SyncRetention::class);
        return ['computers' => ['used' => $w ? 1 : 0, 'limit' => self::COMPUTER_LIMIT],
            'hours' => app(Hours::class)->summary($user),
            'storage' => ['usedBytes' => $retention->usedBytes($user), 'limitBytes' => $retention->limitBytes()],
            'sessions' => ['active' => $w && app(Computers::class)->isFresh($w) ? (int) $w->host_running : 0, 'limit' => null],
            'idleStopSeconds' => (int) config('cloud_workspaces.idle_seconds'),
            'maxSessionSeconds' => (int) config('cloud_workspaces.max_background_seconds'),
            'projectLimit' => self::PROJECT_LIMIT];
    }
}
