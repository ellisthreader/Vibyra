<?php
namespace App\Services\CloudComputer;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Logins for Vibyra Cloud. The Mac uploads one sealed blob; the backend stores ciphertext and never opens it.
 * `origin: cloud` (2026-10-07) is a fresh login the Mac created only for Cloud (Codex `auth.json`, Claude long-lived token);
 * null is a copy of the Mac's own Codex login, which the VM drops and which can never replace a Cloud login.
 * The blob file goes as soon as the cloud computer acks it (ok or not), when a newer one replaces it, after 24 hours, or with the account.
 */
class SyncLogins
{
    public const PROVIDERS = ['codex', 'claude'];
    public const ORIGINS = ['cloud'];
    public const MAX_BYTES = 262144;
    public const MAX_AGE_HOURS = 24;

    /** `logins` for GET /sync. */
    public function payload(int $user): array
    {
        $rows = DB::table('cloud_sync_logins')->where('user_id', $user)->get()->keyBy('provider');
        $out = [];
        foreach (self::PROVIDERS as $p) {
            $r = $rows[$p] ?? null;
            $out[$p] = ['seq' => (int) ($r->seq ?? 0), 'appliedSeq' => (int) ($r->applied_seq ?? 0), 'pending' => (bool) ($r->blob_id ?? false),
                'appliedAt' => ($r->applied_at ?? null) ? Carbon::parse($r->applied_at)->toIso8601String() : null, 'origin' => $r->origin ?? null];
        }
        return $out;
    }

    /** Streams the sealed body to the sync disk and replaces any older un-applied login blob at once. */
    public function receive(int $user, string $provider, int $seq, string $sha256, $stream, ?int $declared, ?string $origin = null, ?string $targetVmKey = null): void
    {
        if ($targetVmKey !== null && $origin !== 'cloud') Computers::fail('invalid_request', 'Only a sign-in made for Cloud can specify its computer key.', 422);
        $this->admit($user, $provider, $origin);
        if ($declared !== null && $declared > self::MAX_BYTES) Computers::fail('too_large', 'That login is too large to carry over.', 413);
        $this->checkSeq($this->row($user, $provider), $seq);
        $upload = app(SyncUpload::class);
        $spooled = $upload->spool($stream, self::MAX_BYTES, 'That login is too large to carry over.');
        $tmp = $spooled['path'];
        $retention = app(SyncRetention::class);
        try {
            if ($spooled['bytes'] === 0) Computers::fail('empty_body', 'The upload was empty.', 422);
            if (!hash_equals($sha256, $spooled['sha256'])) Computers::fail('sha_mismatch', 'The upload did not match its checksum. Try again.', 422);
            $id = (string) Str::uuid(); $path = $user.'/logins/'.$id;
            $upload->store($tmp, $path);
        } catch (\Throwable $e) { @unlink($tmp); throw $e; }
        try {
            $old = DB::transaction(function () use ($user, $provider, $seq, $id, $path, $spooled, $origin, $targetVmKey) {
                app(\App\Services\Vibes\Wallet::class)->lock($user);
                if ($targetVmKey !== null) {
                    // Runtime key changes share Wallet admission; row lock also fences lifecycle key clearing.
                    DB::table('cloud_sync_vm_keys')->where('user_id', $user)->lockForUpdate()->first();
                    $currentKey = app(SyncKeys::class)->vmKey($user);
                    if ($currentKey === null || !hash_equals($currentKey, $targetVmKey))
                        Computers::fail('vm_key_changed', 'The cloud computer key changed. Refresh it and send the sign-in again.', 409);
                }
                $row = DB::table('cloud_sync_logins')->where('user_id', $user)->where('provider', $provider)->lockForUpdate()->first();
                // Gone mid-upload: the agreement was withdrawn and the account purged. The stored file is deleted below.
                if (!$row) Computers::fail('connect_required', 'Connect to the cloud from your iPhone first.', 409);
                $this->checkSeq($row, $seq);
                $this->admit($user, $provider, $origin, $row); // blocked while this upload was streaming
                DB::table('cloud_sync_logins')->where('id', $row->id)->update(['seq' => $seq, 'origin' => $origin, 'blob_id' => $id, 'path' => $path, 'bytes' => $spooled['bytes'], 'sha256' => $spooled['sha256'],
                    'uploaded_at' => now(), 'fetched_at' => null, 'failed_at' => null, 'error' => null, 'updated_at' => now()]);
                return $row->path;
            });
        } catch (\Throwable $e) { $this->deleteFile($path); throw $e; }
        if ($old) $this->deleteFile($old);
    }

    /** DELETE: drops a pending COPY of the Mac's login; seq/applied metadata stays so the next upload still has to be newer.
     *  A login made for Cloud is never dropped this way (an older Mac taking its copy back must not remove Cloud's own). */
    public function remove(int $user, string $provider, ?int $expectedSeq = null): void
    {
        DB::transaction(function () use ($user, $provider, $expectedSeq) {
            // receive() takes this same row lock: a copy withdrawal cannot clear a newer Cloud login's pointer.
            $row = DB::table('cloud_sync_logins')->where('user_id', $user)->where('provider', $provider)->lockForUpdate()->first();
            if (!$row || $row->origin === 'cloud' || ($expectedSeq !== null && (int) $row->seq !== $expectedSeq)) return;
            $this->dropBlob($row);
        }, 5);
    }

    /** Runtime inbox items. */
    public function pending(int $user): array
    {
        return DB::table('cloud_sync_logins')->where('user_id', $user)->whereNotNull('blob_id')->orderBy('provider')->get()->filter(fn ($r) => app(AccessProviders::class)->enabled($user, $r->provider))->map(fn ($r) => ['id' => $r->blob_id, 'project' => null,
            'provider' => $r->provider, 'origin' => $r->origin, 'kind' => 'login', 'seq' => (int) $r->seq, 'bytes' => (int) $r->bytes, 'sha256' => $r->sha256])->values()->all();
    }

    public function pendingCount(int $user): int
    {
        return count($this->pending($user));
    }

    /** A blob-shaped object (path, bytes, sha256) for the shared download response, or null when this id is not a live login blob. */
    public function blob(int $user, string $id): ?object
    {
        $r = DB::table('cloud_sync_logins')->where('user_id', $user)->where('blob_id', $id)->first();
        if (!$r || !app(AccessProviders::class)->enabled($user, $r->provider)) return null;
        DB::table('cloud_sync_logins')->where('id', $r->id)->whereNull('fetched_at')->update(['fetched_at' => now()]);
        return (object) ['id' => $r->blob_id, 'path' => $r->path, 'bytes' => $r->bytes, 'sha256' => $r->sha256];
    }

    /** The cloud computer's result. Returns false when `$id` is not a login blob (the caller falls through to project blobs). The file goes either way. */
    public function applied(int $user, string $id, array $d, ?object $runtime = null): bool
    {
        return DB::transaction(function () use ($user, $id, $d, $runtime) {
            app(\App\Services\Vibes\Wallet::class)->lock($user);
            if ($runtime) app(\App\Services\CloudWorkspaces\Runtime::class)->current($runtime);
            $r = DB::table('cloud_sync_logins')->where('user_id', $user)->where('blob_id', $id)->lockForUpdate()->first();
            if (!$r) return false;
            $ok = (bool) ($d['ok'] ?? true);
            $meta = $ok ? ['applied_seq' => max((int) $r->applied_seq, (int) $r->seq), 'applied_at' => now(), 'failed_at' => null, 'error' => null]
                : ['failed_at' => now(), 'error' => mb_substr((string) ($d['error'] ?? 'apply_failed'), 0, 200)];
            DB::table('cloud_sync_logins')->where('id', $r->id)->where('seq', $r->seq)->where('blob_id', $r->blob_id)->where('path', $r->path)
                ->update($meta + ['updated_at' => now()]);
            // The authority check and acknowledgement commit together. Physical cleanup
            // only follows a successful commit and uses this exact immutable snapshot.
            $this->dropBlob($r, [], true);
            return true;
        }, 5);
    }

    /** Scheduled: a login blob never stays more than 24 hours. Returns how many went. */
    public function sweep(): int
    {
        $n = 0;
        foreach (DB::table('cloud_sync_logins')->whereNotNull('blob_id')->where('uploaded_at', '<', now()->subHours(self::MAX_AGE_HOURS))->get() as $r) { $this->dropBlob($r); $n++; }
        return $n;
    }

    /** The cloud computer lost its copy (new key or removed volume): a pending blob is unreadable and nothing was applied. */
    public function vmLostItsCopy(int $user, bool $afterCommit = false): void
    {
        foreach (DB::table('cloud_sync_logins')->where('user_id', $user)->get() as $r) {
            $this->dropBlob($r->blob_id ? $r : null, [], $afterCommit);
            DB::table('cloud_sync_logins')->where('id', $r->id)->update(['applied_seq' => 0, 'applied_at' => null, 'updated_at' => now()]);
        }
    }

    private function row(int $user, string $provider): ?object
    {
        DB::table('cloud_sync_logins')->insertOrIgnore(['user_id' => $user, 'provider' => $provider, 'created_at' => now(), 'updated_at' => now()]);
        return DB::table('cloud_sync_logins')->where('user_id', $user)->where('provider', $provider)->first();
    }

    /** A login made for Cloud needs provider permission, but never the legacy carry-over permission. A copy of the Mac's own login only for Codex, only while the phone allows it,
     *  and never over a Cloud login (it would replace a working sign-in with one that signs the Mac out). */
    private function admit(int $user, string $provider, ?string $origin = null, ?object $row = null): void
    {
        if (!app(AccessProviders::class)->enabled($user, $provider))
            Computers::fail('login_blocked', 'This AI account is turned off for Vibyra Cloud.', 409);
        if ($origin === 'cloud') return;
        $row ??= DB::table('cloud_sync_logins')->where('user_id', $user)->where('provider', $provider)->first();
        if ($provider !== 'codex' || ($row->origin ?? null) === 'cloud' || app(AccessProviders::class)->blocked($user, $provider))
            Computers::fail('login_blocked', 'Vibyra Cloud uses its own sign-in for this account.', 409);
    }

    private function checkSeq(?object $row, int $seq): void
    {
        $last = (int) ($row->seq ?? 0);
        if ($seq <= $last) Computers::fail('seq_conflict', 'A newer login was already sent.', 409, ['expected' => $last + 1]);
    }

    /** File first, then the pointer: a failed delete leaves the row so the sweep retries. */
    private function dropBlob(?object $r, array $meta = [], bool $afterCommit = false): void
    {
        if ($afterCommit) {
            DB::afterCommit(fn () => $this->dropBlobNow($r, $meta));
            return;
        }
        $this->dropBlobNow($r, $meta);
    }

    private function dropBlobNow(?object $r, array $meta): void
    {
        if (!$r || !$r->blob_id) return;
        if ($r->path && !$this->deleteFile($r->path)) return;
        // A newer receive may have replaced this snapshot while its old file was being deleted.
        DB::table('cloud_sync_logins')->where('id', $r->id)->where('seq', $r->seq)
            ->where('blob_id', $r->blob_id)->where('path', $r->path)
            ->update($meta + ['blob_id' => null, 'path' => null, 'bytes' => 0, 'sha256' => null, 'uploaded_at' => null, 'updated_at' => now()]);
    }

    private function deleteFile(string $path): bool
    {
        try { app(SyncRetention::class)->disk()->delete($path); return true; } catch (\Throwable $e) { report($e); return false; }
    }
}
