<?php
namespace App\Services\Account;

use Illuminate\Support\Facades\{DB, Schema};

/**
 * The Macs an account has signed into the desktop app on (docs/start-route-contract.md). A Mac counts when it registered for remote
 * access (`remote_hosts` with an app version: agent runtimes and the cloud computer insert host rows without one, and the cloud
 * computer's own host is excluded by id). Macs that linked themselves (`linked_macs`) are added when that table exists; this release
 * has no route that writes it yet.
 */
final class LinkedMacs
{
    /** @return list<array{id:string,name:string,online:bool,lastSeenAt:?string,hostId:?string}> newest first */
    public function list(int $user): array
    {
        $cloud = DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'computer')->whereNotNull('remote_host_id')->pluck('remote_host_id')->all();
        $hosts = DB::table('remote_hosts')->where('user_id', $user)->whereNull('revoked_at')->whereNotNull('app_version')
            ->whereNotIn('id', $cloud)->where(fn ($q) => $q->whereNull('platform')->orWhere('platform', '!=', 'cloud'))->get();
        $out = [];
        foreach ($hosts as $h) {
            $out['host:'.$h->host_id] = ['id' => 'host:'.$h->host_id, 'name' => (string) $h->name, 'hostId' => $h->host_id,
                'online' => $h->online_until !== null && now()->lt($h->online_until), 'lastSeenAt' => self::iso($h->last_seen_at ?? $h->registered_at)];
        }
        $linked = Schema::hasTable('linked_macs') ? DB::table('linked_macs')->where('user_id', $user)->whereNull('revoked_at')->get() : [];
        foreach ($linked as $m) {
            // A Mac that also registered for remote access shows once, under its host (same key, or same name): the host carries online.
            $twin = collect($out)->first(fn ($h) => $h['hostId'] !== null && ($m->host_key ? $h['hostId'] === $m->host_key : $h['name'] === $m->name));
            if ($twin) { $out[$twin['id']]['lastSeenAt'] = self::latest($twin['lastSeenAt'], self::iso($m->last_seen_at)); continue; }
            $out['mac:'.$m->device_id] = ['id' => 'mac:'.$m->device_id, 'name' => (string) $m->name, 'hostId' => $m->host_key, 'online' => false, 'lastSeenAt' => self::iso($m->last_seen_at)];
        }
        $list = array_values($out);
        usort($list, fn ($a, $b) => [$b['online'], (string) $b['lastSeenAt']] <=> [$a['online'], (string) $a['lastSeenAt']]);
        return $list;
    }

    private static function iso($at): ?string
    {
        return $at ? \Illuminate\Support\Carbon::parse($at)->toIso8601String() : null;
    }

    private static function latest(?string $a, ?string $b): ?string
    {
        return max((string) $a, (string) $b) ?: null;
    }
}
