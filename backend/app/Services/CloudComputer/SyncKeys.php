<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\DB;

/** Cloud sync keys: the Macs registered for return trips, the cloud computer's own key and its "applying" flag. */
class SyncKeys
{
    public const MAX_MACS = 5;
    public const APPLYING_FRESH_SECONDS = 600;
    /** A Mac that checked in or reported within this long is online; its report (paused, errors) counts this long too. */
    public const MAC_ONLINE_SECONDS = 150;
    /** An upload in flight counts only from a report this recent (the Mac reports every 15 s while sending). */
    public const UPLOAD_FRESH_SECONDS = 45;

    public function putMac(int $user, string $deviceId, string $publicKey, string $name, bool $replace): object
    {
        return DB::transaction(function () use ($user, $deviceId, $publicKey, $name, $replace) {
            $mac = DB::table('cloud_sync_macs')->where('user_id', $user)->where('device_id', $deviceId)->lockForUpdate()->first();
            if ($mac) {
                // A new key cannot open what was sealed for the old one: those downloads are dropped.
                if ($mac->public_key !== $publicKey) app(SyncRetention::class)->dropDownFor($user, [$mac->id]);
                DB::table('cloud_sync_macs')->where('id', $mac->id)->update(['name' => $name, 'public_key' => $publicKey, 'last_seen_at' => now(), 'updated_at' => now()]);
                return DB::table('cloud_sync_macs')->where('id', $mac->id)->first();
            }
            $macs = DB::table('cloud_sync_macs')->where('user_id', $user)->get();
            if ($macs->count() >= self::MAX_MACS) {
                if (!$replace) Computers::fail('too_many_macs', 'This account already syncs '.self::MAX_MACS.' Macs. Remove one first.', 409);
                $oldest = $macs->sortBy(fn ($m) => ($m->last_seen_at ?? '0000').'|'.$m->created_at)->first();
                app(SyncRetention::class)->dropDownFor($user, [$oldest->id]);
                DB::table('cloud_sync_macs')->where('id', $oldest->id)->delete();
            }
            $id = DB::table('cloud_sync_macs')->insertGetId(['user_id' => $user, 'device_id' => $deviceId, 'name' => $name, 'public_key' => $publicKey,
                'last_seen_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            return DB::table('cloud_sync_macs')->where('id', $id)->first();
        });
    }

    public function macs(int $user): array
    {
        return DB::table('cloud_sync_macs')->where('user_id', $user)->orderBy('id')->get()->map(fn ($m) => $this->mac($m))->all();
    }

    public function findMac(int $user, string $deviceId): ?object
    {
        return DB::table('cloud_sync_macs')->where('user_id', $user)->where('device_id', $deviceId)->first();
    }

    public function touchMac(object $mac): void
    {
        DB::table('cloud_sync_macs')->where('id', $mac->id)->update(['last_seen_at' => now()]);
    }

    /** A Mac reading the sync state: at most one write a minute per Mac. */
    public function checkIn(object $mac): void
    {
        if (!$mac->last_seen_at || \Illuminate\Support\Carbon::parse($mac->last_seen_at)->lt(now()->subMinute())) $this->touchMac($mac);
    }

    /**
     * The phone's view of the account's Macs, most recent first (at most 5): when each last checked in and what it says it is
     * doing. state: offline (nothing for MAC_ONLINE_SECONDS) | paused | syncing (an upload in flight) | error | idle.
     */
    public function seen(int $user): array
    {
        $iso = fn ($v) => $v ? \Illuminate\Support\Carbon::parse($v)->toIso8601String() : null;
        return DB::table('cloud_sync_macs')->where('user_id', $user)->orderByRaw('last_seen_at is null')->orderByDesc('last_seen_at')->orderByDesc('id')->limit(5)->get()
            ->map(function ($m) use ($iso) {
                $r = $this->report($m); $online = $this->online($m);
                $error = $r ? collect($r['projects'])->first(fn ($p) => $p['phase'] === 'error') : null;
                $state = !$online ? 'offline' : (($r['paused'] ?? false) ? 'paused' : ($this->current($m) ? 'syncing' : ($error ? 'error' : 'idle')));
                return ['id' => $m->device_id, 'name' => $m->name, 'lastSeenAt' => $iso($m->last_seen_at), 'state' => $state, 'current' => $online ? $this->current($m) : null,
                    'lastError' => $error ? ['code' => $error['code'] ?? 'mac_error', 'message' => $error['message'] ?? null] : null, 'reportedAt' => $iso($m->reported_at)];
            })->all();
    }

    /** PUT sync/macs/{id}/status: what this Mac is doing. Also a check-in. */
    public function putReport(object $mac, array $report): void
    {
        DB::table('cloud_sync_macs')->where('id', $mac->id)->update(['status' => json_encode($report), 'reported_at' => now(), 'last_seen_at' => now(), 'updated_at' => now()]);
        if ($report['current'] ?? null) $this->touchComputer((int) $mac->user_id);
    }

    /** The stored report while it still counts (MAC_ONLINE_SECONDS), else null. */
    public function report(object $mac): ?array
    {
        if (!$mac->status || !$mac->reported_at || \Illuminate\Support\Carbon::parse($mac->reported_at)->lt(now()->subSeconds(self::MAC_ONLINE_SECONDS))) return null;
        $r = json_decode($mac->status, true);
        return is_array($r) ? $r + ['paused' => false, 'current' => null, 'projects' => []] : null;
    }

    public function online(object $mac): bool
    {
        $at = max((string) $mac->last_seen_at, (string) $mac->reported_at);
        return $at !== '' && \Illuminate\Support\Carbon::parse($at)->gte(now()->subSeconds(self::MAC_ONLINE_SECONDS));
    }

    /** The upload in flight, from a report at most UPLOAD_FRESH_SECONDS old. */
    public function current(object $mac): ?array
    {
        if (!$mac->reported_at || \Illuminate\Support\Carbon::parse($mac->reported_at)->lt(now()->subSeconds(self::UPLOAD_FRESH_SECONDS))) return null;
        return $this->report($mac)['current'] ?? null;
    }

    /** Every Mac of the account with its live report (for SyncStatus). */
    public function reports(int $user): \Illuminate\Support\Collection
    {
        return DB::table('cloud_sync_macs')->where('user_id', $user)->get()->map(fn ($m) => (object) ['mac' => $m, 'online' => $this->online($m),
            'report' => $this->report($m), 'current' => $this->current($m)]);
    }

    /** Synced work that should keep the computer up (Idle): uploads to apply, an apply under way, or a Mac still sending. */
    public function workFor(int $user): bool
    {
        return app(SyncQueue::class)->pendingCount($user) > 0 || $this->applying($user)
            || $this->reports($user)->contains(fn ($r) => $r->current !== null);
    }

    /** Synced work moved: the running (or starting) computer's idle clock starts again. */
    public function touchComputer(int $user): void
    {
        DB::table('cloud_workspaces')->where('user_id', $user)->where('kind', 'computer')->whereIn('state', ['starting', 'ready'])->update(['last_activity_at' => now()]);
    }

    public function mac(object $m): array
    {
        return ['id' => $m->device_id, 'name' => $m->name, 'publicKey' => $m->public_key, 'lastSeenAt' => $m->last_seen_at ? \Illuminate\Support\Carbon::parse($m->last_seen_at)->toIso8601String() : null];
    }

    public function vmKey(int $user): ?string
    {
        return DB::table('cloud_sync_vm_keys')->where('user_id', $user)->value('public_key');
    }

    /** Idempotent. A different key replaces the old: nothing sealed for the old one is readable, so every project starts over. */
    public function setVmKey(int $user, string $publicKey): void
    {
        DB::transaction(function () use ($user, $publicKey) {
            $row = DB::table('cloud_sync_vm_keys')->where('user_id', $user)->lockForUpdate()->first();
            if (!$row) DB::table('cloud_sync_vm_keys')->insert(['user_id' => $user, 'public_key' => $publicKey, 'created_at' => now(), 'updated_at' => now()]);
            elseif ($row->public_key === $publicKey) return;
            else DB::table('cloud_sync_vm_keys')->where('user_id', $user)->update(['public_key' => $publicKey, 'updated_at' => now()]);
            if ($row && $row->public_key) app(SyncRetention::class)->vmLostItsCopy($user, true);
        });
    }

    /** The computer's sync status: applying, and (optional) whether its key is published and its last failure. */
    public function setApplying(int $user, bool $applying, ?bool $keyOk = null, ?array $lastError = null, bool $clearError = false): void
    {
        $row = ['applying' => $applying, 'applying_at' => $applying ? now() : null, 'updated_at' => now()]
            + ($keyOk !== null ? ['key_ok' => $keyOk] : [])
            + ($lastError ? ['last_error' => json_encode($lastError), 'last_error_at' => now()] : ($clearError ? ['last_error' => null, 'last_error_at' => null] : []));
        if ($applying) $this->touchComputer($user); // only real work: an idle "applying: false" every pass must not hold it up
        if (!DB::table('cloud_sync_vm_keys')->where('user_id', $user)->update($row)) {
            DB::table('cloud_sync_vm_keys')->insertOrIgnore(['user_id' => $user, 'created_at' => now()] + $row);
        }
    }

    /** {keyOk, lastError: {code, message, project?, at}|null} as the computer last reported it. */
    public function vmHealth(int $user): array
    {
        $row = DB::table('cloud_sync_vm_keys')->where('user_id', $user)->first();
        $error = $row && $row->last_error ? json_decode($row->last_error, true) : null;
        return ['keyOk' => $row && $row->key_ok !== null ? (bool) $row->key_ok : null,
            'lastError' => $error ? $error + ['at' => \Illuminate\Support\Carbon::parse($row->last_error_at)->toIso8601String()] : null];
    }

    public function applying(int $user): bool
    {
        $row = DB::table('cloud_sync_vm_keys')->where('user_id', $user)->first();
        return $row && $row->applying && $row->applying_at && now()->lt(\Illuminate\Support\Carbon::parse($row->applying_at)->addSeconds(self::APPLYING_FRESH_SECONDS));
    }
}
