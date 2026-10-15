<?php

namespace App\Services\Privacy;

use App\Jobs\BuildAccountExport;
use App\Models\{AccountExport, User};
use App\Services\AgentRuns\ApiError;
use App\Services\Platform\AccountActivity;
use Illuminate\Support\Facades\{DB, Storage, URL};

/**
 * "Download my data": admission, status and delivery. At most one export is admitted per account per interval (24 h), decided under the
 * user row lock so racing requests admit exactly one; a failed build does not use the allowance. The archive is built by a queued
 * job; delivery is a signed link that lives minutes and is minted fresh on every status read, never stored.
 */
final class AccountExports
{
    public static function enabled(): bool
    {
        return (bool) config('reliability.export.enabled');
    }

    public static function directory(int $userId): string
    {
        return 'account-exports/'.$userId;
    }

    public static function disk(): string
    {
        return (string) config('reliability.export.disk');
    }

    public function request(User $user): AccountExport
    {
        $interval = (int) config('reliability.export.interval_hours');
        $export = DB::transaction(function () use ($user, $interval): AccountExport {
            User::query()->whereKey($user->getKey())->lockForUpdate()->first(['id']);
            $last = AccountExport::query()->where('user_id', $user->getKey())->where('status', '!=', 'failed')->orderByDesc('requested_at')->first();
            if ($last && $last->requested_at->gt(now()->subHours($interval)))
                ApiError::throw(429, 'export_rate_limited', 'You can download your data once a day. Try again later.',
                    ['nextAllowedAt' => $last->requested_at->copy()->addHours($interval)->toIso8601String()]);
            return AccountExport::query()->create(['user_id' => $user->getKey(), 'status' => 'queued', 'requested_at' => now()]);
        });
        AccountActivity::record($user, 'data_export.requested');
        BuildAccountExport::dispatch($export->id);
        return $export;
    }

    /** Runs in the queue. Idempotent: only a queued export is built, and a second worker finds it already claimed. */
    public function build(string $id): void
    {
        $claimed = AccountExport::query()->whereKey($id)->where('status', 'queued')->update(['status' => 'building', 'updated_at' => now()]);
        $export = $claimed ? AccountExport::query()->find($id) : null;
        $user = $export ? User::query()->find($export->user_id) : null;
        if (!$export || !$user) return;
        $path = self::directory($user->id).'/'.$export->id.'.zip';
        try {
            $bytes = app(ExportBuilder::class)->build($user, $path);
            $kept = DB::transaction(function () use ($user, $export, $path, $bytes) {
                // Account deletion holds this same user lock. A late worker must not publish after deletion or reaping.
                if (!User::query()->whereKey($user->id)->lockForUpdate()->first(['id'])) return false;
                return AccountExport::query()->whereKey($export->id)->where('status', 'building')->update([
                    'status' => 'ready', 'path' => $path, 'bytes' => $bytes, 'ready_at' => now(),
                    'expires_at' => now()->addHours((int) config('reliability.export.keep_hours')), 'error' => null]) === 1;
            });
            if (!$kept) Storage::disk(self::disk())->delete($path);
        } catch (\Throwable $e) {
            report($e);
            AccountExport::query()->whereKey($export->id)->where('status', 'building')->update(['status' => 'failed', 'error' => 'build_failed']);
            try { Storage::disk(self::disk())->delete($path); } catch (\Throwable) {}
        }
    }

    /** The newest export and what the person can do next. The link exists only while the archive does, and is minted here. */
    public function status(User $user): array
    {
        $this->reap($user->getKey());
        $last = AccountExport::query()->where('user_id', $user->getKey())->orderByDesc('requested_at')->first();
        $interval = (int) config('reliability.export.interval_hours');
        $ready = $last && $last->status === 'ready' && $last->expires_at?->isFuture() && $last->path && Storage::disk(self::disk())->exists($last->path);
        // An archive lost with its disk (a redeploy on an ephemeral disk) is expired, never a link that 404s.
        if ($last && $last->status === 'ready' && !$ready) $last->forceFill(['status' => 'expired', 'path' => null])->save();
        $blocked = $last && $last->status !== 'failed' && $last->requested_at->gt(now()->subHours($interval));
        return ['enabled' => true, 'status' => $last ? ($last->status === 'ready' && !$ready ? 'expired' : $last->status) : 'none',
            'requestedAt' => $last?->requested_at->toIso8601String(), 'bytes' => $ready ? $last->bytes : null,
            'link' => $ready ? URL::temporarySignedRoute('account-export.download', now()->addMinutes((int) config('reliability.export.link_minutes')),
                ['export' => $last->id]) : null,
            'linkExpiresInMinutes' => $ready ? (int) config('reliability.export.link_minutes') : null,
            'archiveExpiresAt' => $ready ? $last->expires_at->toIso8601String() : null,
            'canRequest' => !$blocked, 'nextAllowedAt' => $blocked ? $last->requested_at->copy()->addHours($interval)->toIso8601String() : null];
    }

    /** A build that never finished (a killed worker) is failed after half an hour, which also gives the allowance back. */
    public function reap(?int $userId = null): int
    {
        return AccountExport::query()->whereIn('status', ['queued', 'building'])->where('updated_at', '<', now()->subMinutes(30))
            ->when($userId, fn ($q) => $q->where('user_id', $userId))->update(['status' => 'failed', 'error' => 'stalled']);
    }

    /** Archives past their keep time, and files of failed builds. Runs whatever the flag says, so switching the feature off still cleans up. */
    public function prune(): int
    {
        $n = $this->reap();
        $rows = AccountExport::query()->where('status', 'ready')->where('expires_at', '<=', now())->limit(200)->get();
        foreach ($rows as $row) {
            if ($row->path) Storage::disk(self::disk())->delete($row->path);
            $row->forceFill(['status' => 'expired', 'path' => null])->save();
            $n++;
        }
        return $n;
    }

    /** The stored archive for a signed download, or null once it is gone. */
    public function archive(string $id): ?AccountExport
    {
        $row = AccountExport::query()->whereKey($id)->where('status', 'ready')->first();
        return $row && $row->path && $row->expires_at?->isFuture() && Storage::disk(self::disk())->exists($row->path) ? $row : null;
    }
}
