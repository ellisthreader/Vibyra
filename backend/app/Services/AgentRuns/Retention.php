<?php

namespace App\Services\AgentRuns;

use Illuminate\Support\Facades\{DB, Storage};

/**
 * What Agent V2 keeps, and for how long (F-04). Journals (`agent_run_events`) and receipts carry no user id, so a
 * deleted account's rows are purged by run id; files follow the account-deletion cleanup record. While an account
 * lives, finished runs' journals and attachment files age out (`agents_v2.retention`, 0 turns a rule off); receipts stay.
 */
final class Retention
{
    private const BATCH = 200;

    /** Everything Agent V2 holds for an account that is not removed by a foreign key cascade. Call before deleting the user row. */
    public function purgeAccount(int $userId): void
    {
        $runs = DB::table('agent_runs')->where('user_id', $userId)->select('id');
        DB::table('agent_run_events')->whereIn('run_id', $runs)->delete();
        DB::table('agent_receipts')->whereIn('run_id', $runs)->delete();
        $items = DB::table('notification_items')->where('user_id', $userId)->select('id');
        DB::table('notification_deliveries')->whereIn('item_id', $items)
            ->orWhereIn('device_id', DB::table('notification_devices')->where('user_id', $userId)->select('id'))->delete();
    }

    /** @return array{disk: string, directory: string} where an account's uploaded files live */
    public static function attachmentsOf(int $userId): array
    {
        return ['disk' => self::disk(), 'directory' => 'agent-v2-attachments/'.$userId];
    }

    public static function disk(): string
    {
        return (string) config('agents_v2.attachments_disk', config('vibes.attachments_disk', 'local'));
    }

    /** @return array{events: int, attachments: int, orphans: int} */
    public function prune(): array
    {
        $cfg = (array) config('agents_v2.retention', []);
        return ['events' => $this->journals((int) ($cfg['events_days'] ?? 0)),
            'attachments' => $this->files((int) ($cfg['attachments_days'] ?? 0), (int) ($cfg['unattached_hours'] ?? 0)),
            'orphans' => $this->orphans()];
    }

    private function journals(int $days): int
    {
        if ($days < 1) return 0;
        $deleted = 0;
        for ($round = 0; $round < 50; $round++) {
            $ids = DB::table('agent_runs')->whereIn('state', RunStates::TERMINAL)->where('finished_at', '<', now()->subDays($days))
                ->whereExists(fn ($q) => $q->selectRaw('1')->from('agent_run_events')->whereColumn('agent_run_events.run_id', 'agent_runs.id'))
                ->limit(self::BATCH)->pluck('id')->all();
            if (!$ids) break;
            $deleted += DB::table('agent_run_events')->whereIn('run_id', $ids)->delete();
        }
        return $deleted;
    }

    /** Files of runs that ended more than `$days` ago, and uploads nobody attached within `$unattachedHours`. */
    private function files(int $days, int $unattachedHours): int
    {
        $limit = array_filter([$days > 0 ? $days * 24 : null, $unattachedHours > 0 ? $unattachedHours : null]);
        if (!$limit) return 0;
        $deleted = 0;
        $rows = DB::table('agent_v2_attachments')->where('created_at', '<', now()->subHours(min($limit)))->orderBy('created_at')->limit(self::BATCH * 5)->get();
        foreach ($rows as $row) {
            $runs = DB::table('agent_runs')->where('user_id', $row->user_id)->where(function ($q) use ($row) {
                $q->where('attachments', 'like', '%'.$row->id.'%')->orWhereIn('id', DB::table('agent_tool_actions')
                    ->where('user_id', $row->user_id)->where('tool', 'gmail_send')->where('arguments', 'like', '%'.$row->id.'%')->select('run_id'));
            })->get(['state', 'finished_at']);
            $expired = $runs->isEmpty() ? $unattachedHours > 0 : ($days > 0 && $runs->every(fn ($r) => RunStates::terminal($r->state)
                && $r->finished_at !== null && $r->finished_at < now()->subDays($days)->toDateTimeString()));
            if (!$expired) continue;
            Storage::disk(self::disk())->delete($row->path);
            $deleted += DB::table('agent_v2_attachments')->where('id', $row->id)->delete();
        }
        return $deleted;
    }

    /** Journal and receipt rows whose run is gone (a deleted account, before this purge existed). */
    private function orphans(): int
    {
        $gone = fn ($q, string $table) => $q->selectRaw('1')->from('agent_runs')->whereColumn('agent_runs.id', $table.'.run_id');
        return DB::table('agent_run_events')->whereNotExists(fn ($q) => $gone($q, 'agent_run_events'))->delete()
            + DB::table('agent_receipts')->whereNotExists(fn ($q) => $gone($q, 'agent_receipts'))->delete();
    }
}
