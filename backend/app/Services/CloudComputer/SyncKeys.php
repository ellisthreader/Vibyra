<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Facades\DB;

/** Cloud sync keys: the Macs registered for return trips, the cloud computer's own key and its "applying" flag. */
class SyncKeys
{
    public const MAX_MACS = 5;
    public const APPLYING_FRESH_SECONDS = 600;

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
            if ($row && $row->public_key) app(SyncRetention::class)->vmLostItsCopy($user);
        });
    }

    public function setApplying(int $user, bool $applying): void
    {
        $row = ['applying' => $applying, 'applying_at' => $applying ? now() : null, 'updated_at' => now()];
        if (!DB::table('cloud_sync_vm_keys')->where('user_id', $user)->update($row)) {
            DB::table('cloud_sync_vm_keys')->insertOrIgnore(['user_id' => $user, 'created_at' => now()] + $row);
        }
    }

    public function applying(int $user): bool
    {
        $row = DB::table('cloud_sync_vm_keys')->where('user_id', $user)->first();
        return $row && $row->applying && $row->applying_at && now()->lt(\Illuminate\Support\Carbon::parse($row->applying_at)->addSeconds(self::APPLYING_FRESH_SECONDS));
    }
}
