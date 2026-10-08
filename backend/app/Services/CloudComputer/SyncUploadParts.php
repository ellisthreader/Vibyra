<?php
namespace App\Services\CloudComputer;

/**
 * Resumable uploads for big projects over weak connections (a Mac on a phone hotspot). The Mac sends the sealed bundle in
 * pieces (`offset` + `total`); each piece is appended to a part file. A dropped connection costs one piece: the next try is
 * told how much already arrived (409 `offset_mismatch` with `expected`) and carries on from there. When the last piece
 * lands, the whole file goes through the normal upload (`SyncBlobs::receive`): same checksum, seq, quota and storage rules.
 */
class SyncUploadParts
{
    public const MAX_PART = 16 * 1048576;
    /** Unfinished uploads one account may have at once (each up to the per-upload cap), so nobody fills the server's disk. */
    public const MAX_OPEN = 4;
    private const STALE_SECONDS = 86400;

    private function dir(): string
    {
        $dir = rtrim((string) (config('cloud_workspaces.sync_parts_dir') ?: sys_get_temp_dir().'/vibyra-sync-parts'), '/');
        if (!is_dir($dir)) @mkdir($dir, 0700, true);
        return $dir;
    }

    /** One file per upload attempt: the same project, kind, seq, checksum and size always resume the same part. The name
     *  starts with the account and project so their other unfinished parts can be found. */
    private function partFor(object $project, array $q, int $total): string
    {
        return $this->prefix($project).$q['kind'].'-'.hash('sha256', implode('|', [$project->user_id, $project->id, $q['kind'], $q['seq'], $q['sha256'], $total])).'.part';
    }

    private function prefix(object $project, bool $account = false): string
    {
        return $this->dir().'/'.(int) $project->user_id.'-'.($account ? '' : hash('sha256', (string) $project->id).'-');
    }

    /**
     * Before a new upload starts: an older unfinished upload of the same project and kind is dropped (only the newest
     * snapshot matters), the account may hold only MAX_OPEN unfinished uploads, and the whole upload must fit its quota.
     */
    private function admit(object $project, array $q, int $total, string $part): void
    {
        foreach (glob($this->prefix($project).$q['kind'].'-*.part') ?: [] as $old) if ($old !== $part) @unlink($old);
        $open = array_filter(glob($this->prefix($project, true).'*.part') ?: [], fn ($file) => $file !== $part);
        if (count($open) >= self::MAX_OPEN) Computers::fail('too_many_uploads', 'Too many uploads are unfinished. Try again in a moment.', 429);
        // This project's own older blobs may be pruned to make room when it lands (SyncBlobs::checkQuota), so they do not count.
        $retention = app(SyncRetention::class);
        $own = (int) \Illuminate\Support\Facades\DB::table('cloud_sync_blobs')->where('project_id', $project->id)->sum('bytes');
        if ($retention->usedBytes((int) $project->user_id) - $own + $total > $retention->limitBytes()) {
            Computers::fail('quota_exceeded', 'Your cloud storage for synced projects is full.', 413);
        }
    }

    /**
     * Appends one piece. Returns ['complete' => false, 'received' => n] while more is due, or ['complete' => true, 'blob' => row].
     * @param resource $stream
     */
    public function receive(object $project, array $q, int $offset, int $total, $stream, ?int $declared): array
    {
        // Admission spans projects and appends must agree on one current offset.
        // Keep this filesystem lock before any completion wallet/database lock.
        $lock = fopen($this->dir().'/'.(int) $project->user_id.'.lock', 'c');
        if ($lock === false) throw new \RuntimeException('Cloud upload lock is unavailable.');
        try {
            if (!flock($lock, LOCK_EX)) throw new \RuntimeException('Cloud upload lock is unavailable.');
            return $this->receiveLocked($project, $q, $offset, $total, $stream, $declared);
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }

    private function receiveLocked(object $project, array $q, int $offset, int $total, $stream, ?int $declared): array
    {
        $cap = (int) config('cloud_workspaces.sync_max_blob_bytes');
        if ($total < 1) Computers::fail('invalid_request', 'The upload size is missing.', 422);
        if ($total > $cap) Computers::fail('too_large', 'This project is too large to sync ('.number_format($cap / 1048576).' MiB per upload).', 413);
        if ($declared !== null && $declared > self::MAX_PART) Computers::fail('too_large', 'Each piece of an upload must be at most 16 MiB.', 413);
        $this->sweep();
        if ($offset === 0) app(SyncBlobs::class)->precheck($project, 'up', $q); // refuse a stale seq before 300 MB arrive
        $part = $this->partFor($project, $q, $total);
        $have = is_file($part) ? (int) filesize($part) : 0;
        if ($offset === 0 && $have === 0) $this->admit($project, $q, $total, $part);
        if ($offset !== $have) Computers::fail('offset_mismatch', 'Resume the upload from byte '.$have.'.', 409, ['expected' => $have]);
        $out = fopen($part, 'ab'); $added = 0;
        try {
            while (!feof($stream)) {
                $chunk = fread($stream, SyncUpload::CHUNK);
                if ($chunk === false) break;
                if ($chunk === '') continue;
                $added += strlen($chunk);
                if ($added > self::MAX_PART || $have + $added > $total) { fclose($out); @unlink($part); Computers::fail('too_large', 'That piece goes past the upload size. Start again.', 413); }
                fwrite($out, $chunk);
            }
        } finally { if (is_resource($out)) fclose($out); }
        clearstatcache(true, $part);
        $now = (int) filesize($part);
        if ($now < $total) return ['complete' => false, 'received' => $now];
        // Complete: the normal path checks the checksum, seq and quota, and stores it. The part is gone either way.
        $in = fopen($part, 'rb');
        try { $blob = app(SyncBlobs::class)->receive($project, 'up', $q, $in, null, $total); }
        finally { if (is_resource($in)) fclose($in); @unlink($part); }
        return ['complete' => true, 'blob' => $blob];
    }

    /** Every unfinished upload of an account (withdrawal, account deletion). */
    public function purgeUser(int $user): void
    {
        foreach (glob($this->dir().'/'.$user.'-*.part') ?: [] as $file) @unlink($file);
    }

    /** Parts nobody finished within a day are deleted. */
    private function sweep(): void
    {
        if (random_int(1, 20) !== 1) return;
        foreach (glob($this->dir().'/*.part') ?: [] as $file) {
            if (@filemtime($file) < time() - self::STALE_SECONDS) @unlink($file);
        }
    }
}
