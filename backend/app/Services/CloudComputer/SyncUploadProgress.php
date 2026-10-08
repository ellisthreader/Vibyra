<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\Cache;

/** Bytes actually retained by the server, independent of optional Mac status reports. */
final class SyncUploadProgress
{
    public const FRESH_SECONDS = 300;

    private function key(object $project): string
    {
        return 'cloud-sync-upload:'.$project->user_id.':'.$project->id;
    }

    private function attempt(array $query): string
    {
        return hash('sha256', $query['kind'].'|'.$query['seq'].'|'.$query['sha256']);
    }

    public function received(object $project, array $query, int $sent, int $total): void
    {
        if ($sent <= 0 || $sent >= $total) return;
        Cache::put($this->key($project), ['attempt' => $this->attempt($query), 'kind' => $query['kind'],
            'seq' => (int) $query['seq'], 'sent' => $sent, 'total' => $total, 'at' => now()->timestamp], self::FRESH_SECONDS);
        // An older Mac cannot send progress heartbeats, but received bytes are real activity.
        app(SyncKeys::class)->touchComputer((int) $project->user_id);
    }

    public function clear(object $project, array $query): void
    {
        $key = $this->key($project);
        if ((Cache::get($key)['attempt'] ?? null) === $this->attempt($query)) Cache::forget($key);
    }

    public function current(?object $project): ?array
    {
        if (!$project) return null;
        $value = Cache::get($this->key($project));
        if (!is_array($value) || ($value['at'] ?? 0) < now()->timestamp - self::FRESH_SECONDS) return null;
        $stored = ($value['kind'] ?? null) === 'code' ? $project->up_seq : $project->transcripts_seq;
        if (($value['seq'] ?? 0) <= (int) $stored) return null;
        return ['sent' => (int) $value['sent'], 'total' => (int) $value['total']];
    }
}
