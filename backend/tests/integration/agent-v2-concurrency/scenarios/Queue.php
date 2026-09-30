<?php
use Illuminate\Support\Facades\DB;

/** Scenario 7: three real queue workers on Postgres, processing Vibes turns and push deliveries together. */
final class ConcQueue
{
    public static function run(): void
    {
        Conc::$scenario = '7 real queue';
        self::concurrentWorkers();
        ConcQueueKills::run();
    }

    private static function concurrentWorkers(): void
    {
        DB::table('jobs')->delete(); // jobs other scenarios queued (no worker was running then) must not be processed here
        DB::table('failed_jobs')->delete();
        $w = new ConcWorkers;
        try {
            $pids = [$w->start(['CONC_EXPO_STALL_MS' => '150']), $w->start(['CONC_EXPO_STALL_MS' => '150']), $w->start(['CONC_EXPO_STALL_MS' => '150'])];
            sleep(2);
            $turns = []; $deliveries = [];
            for ($i = 0; $i < 18; $i++) {
                $turns[] = ConcWorkers::turn();
                if ($i < 12) $deliveries[] = ConcWorkers::completedRun();
            }
            foreach (array_slice($turns, 0, 6) as $k => [, $id]) { \App\Jobs\RunVibesTurn::dispatch($id); if ($k < 3) \App\Jobs\RunVibesTurn::dispatch($id); }
            foreach (array_slice($deliveries, 0, 4) as [, , $delivery]) \App\Jobs\DeliverPhoneNotification::dispatch($delivery);
            $drained = ConcWorkers::drain(90);
            sleep(1);
        } finally { $w->stopAll(); }
        $settled = 0; $charged = true; $calls = true; $wallets = true;
        foreach ($turns as [$user, $id, $marker]) {
            $t = DB::table('vibes_turns')->find($id);
            $settled += $t->settled_at && $t->status === 'completed' && (int) $t->charged === 200 && $t->response === 'Fake reply.' ? 1 : 0;
            $calls = $calls && ConcFakes::count('OPENROUTER', $marker) === 1;
            $wallets = $wallets && app(\App\Services\Vibes\Wallet::class)->available($user) === 200000 - 200;
        }
        Conc::check('3 workers drained the queue (jobs table empty, no failed_jobs)', $drained && DB::table('failed_jobs')->count() === 0, 'failed_jobs='.DB::table('failed_jobs')->count().' worker stderr: '.substr($w->stderr(), 0, 160));
        Conc::check('18 Vibes turns (6 of them dispatched twice, 3 three times): every turn completed and settled once, charged exactly once; exactly one provider call per turn', $settled === 18 && $calls && $wallets,
            'completed='.$settled.' one-call-each='.json_encode($calls).' wallet-charged-once='.json_encode($wallets).' OPENROUTER calls='.ConcFakes::count('OPENROUTER').' (for 18 turns, 27 jobs)');
        $sent = 0; $once = true; $states = [];
        foreach ($deliveries as [, , $delivery, $item]) {
            $d = DB::table('notification_deliveries')->find($delivery);
            $states[$d->state] = ($states[$d->state] ?? 0) + 1;
            $once = $once && ConcFakes::count('EXPO_PUSH', $item) === 1;
        }
        Conc::check('12 push deliveries (4 dispatched twice): each ticketed once; exactly one Expo push per notification', $states === ['ticketed' => 12] && $once, json_encode($states).' pushes='.ConcFakes::count('EXPO_PUSH'));
        $rows = DB::table('conc_calls')->whereIn('kind', ['OPENROUTER', 'EXPO_PUSH'])->whereNotNull('ended_at')
            ->get(['pid', DB::raw('extract(epoch from started_at) as s'), DB::raw('extract(epoch from ended_at) as e')]);
        $events = [];
        foreach ($rows as $r) { $events[] = [(float) $r->s, 1]; $events[] = [(float) $r->e, -1]; }
        usort($events, fn ($a, $b) => $a[0] <=> $b[0] ?: $a[1] <=> $b[1]);
        $now = 0; $max = 0;
        foreach ($events as [, $d]) { $now += $d; $max = max($max, $now); }
        $distinct = $rows->pluck('pid')->unique()->count();
        Conc::check('work ran concurrently: provider calls from ≥2 worker processes were in flight at the same time', $distinct >= 2 && $max >= 2,
            'distinct worker pids that made provider calls='.$distinct.' of '.count($pids).', peak simultaneous in-flight calls='.$max.', total='.$rows->count());
    }
}
