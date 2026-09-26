<?php

namespace App\Services\Analytics;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class OwnerOperationalReport
{
    public function apply(array $report, Carbon $from, Carbon $to): array
    {
        $sessions = Schema::hasTable('vibyra_sessions') && Schema::hasColumn('vibyra_sessions', 'last_used_at');
        $turns = Schema::hasTable('vibes_turns') && Schema::hasColumn('vibes_turns', 'user_id');
        $registrations = Schema::hasColumn('users', 'guest_at');
        $lastTurn = $turns ? DB::table('vibes_turns')->max('created_at') : null;
        $report['overview']['operations'] = [
            'accounts_used_24h' => $sessions ? DB::table('vibyra_sessions')
                ->where('last_used_at', '>=', $to->copy()->subDay())->distinct()->count('user_id') : null,
            'accounts_used_7d' => $sessions ? DB::table('vibyra_sessions')
                ->where('last_used_at', '>=', $to->copy()->subDays(7))->distinct()->count('user_id') : null,
            'cloud_users' => $turns ? DB::table('vibes_turns')->whereBetween('created_at', [$from, $to])
                ->distinct()->count('user_id') : null,
            'new_registered' => $registrations ? DB::table('users')->whereNull('guest_at')
                ->whereBetween('created_at', [$from, $to])->count() : null,
            'cloud_last_turn_at' => $lastTurn ? Carbon::parse($lastTurn, 'UTC')->toIso8601ZuluString() : null,
        ];
        $report['series']['cloud'] = [];
        if (! $turns) {
            return $report;
        }

        $counts = DB::table('vibes_turns')->whereBetween('created_at', [$from, $to])
            ->selectRaw('DATE(created_at) as day, COUNT(*) as turns, COUNT(DISTINCT user_id) as users')
            ->groupByRaw('DATE(created_at)')->get()->keyBy('day');
        for ($day = $from->copy(); $day->lte($to); $day->addDay()) {
            $date = $day->toDateString();
            $report['series']['cloud'][] = ['date' => $date,
                'turns' => (int) ($counts[$date]->turns ?? 0),
                'users' => (int) ($counts[$date]->users ?? 0)];
        }

        return $report;
    }
}
