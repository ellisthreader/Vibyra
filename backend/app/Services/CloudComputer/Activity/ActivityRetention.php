<?php
namespace App\Services\CloudComputer\Activity;

use Illuminate\Support\Facades\DB;

/** Host phase events live seven days and at most MAX_PER_USER per account (docs/cloud-switching-contract.md section 2). */
class ActivityRetention
{
    /** "Disconnect Vibyra Cloud" and deleted accounts: nothing of the feed is kept. */
    public function purgeUser(int $user): void
    {
        DB::table(HostEvents::TABLE)->where('user_id', $user)->delete();
    }

    /** A runaway Host cannot grow the table: past MAX_PER_USER live rows the account's oldest go. @return int rows removed */
    public function cap(int $user): int
    {
        $over = DB::table(HostEvents::TABLE)->where('user_id', $user)->count() - HostEvents::MAX_PER_USER;
        $total = 0;
        while ($over > 0) {
            $ids = DB::table(HostEvents::TABLE)->where('user_id', $user)->orderBy('at')->orderBy('id')->limit(min($over, 1000))->pluck('id')->all();
            if (!$ids) break;
            $total += DB::table(HostEvents::TABLE)->whereIn('id', $ids)->delete();
            $over -= count($ids);
        }
        return $total;
    }

    /** Deletes in slices so a large backlog never holds one long statement. @return int rows removed */
    public function sweep(): int
    {
        $cutoff = HostEvents::stamp(now()->subDays(HostEvents::RETENTION_DAYS));
        $total = 0;
        do {
            $ids = DB::table(HostEvents::TABLE)->where('at', '<', $cutoff)->orderBy('id')->limit(1000)->pluck('id')->all();
            if ($ids) $total += DB::table(HostEvents::TABLE)->whereIn('id', $ids)->delete();
        } while (count($ids) === 1000);
        return $total;
    }
}
