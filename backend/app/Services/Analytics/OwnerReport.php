<?php

namespace App\Services\Analytics;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class OwnerReport
{
    public function read(int $days): array
    {
        $to = now();
        $from = $to->copy()->startOfDay()->subDays($days - 1);
        $events = DB::table('analytics_events')->whereBetween('occurred_at', [$from, $to]);
        $tracking = collect(['website', 'desktop', 'mobile'])->mapWithKeys(
            fn (string $surface) => [$surface => DB::table('analytics_events')->where('surface', $surface)->min('created_at')]
        )->all();
        $lastEvent = collect(['website', 'desktop', 'mobile'])->mapWithKeys(
            fn (string $surface) => [$surface => DB::table('analytics_events')->where('surface', $surface)->max('created_at')]
        )->all();
        $series = $this->blankSeries($from, $days);
        $counts = (clone $events)->selectRaw('DATE(occurred_at) as day, surface, event, COUNT(*) as total')
            ->groupByRaw('DATE(occurred_at), surface, event')->get();
        foreach ($counts as $row) {
            $key = match ($row->event) {
                'website_page_view' => 'page_views',
                'website_signup' => 'signups',
                'website_download' => 'downloads',
                'desktop_app_opened', 'mobile_app_opened' => 'app_opens',
                'desktop_prompt_submitted' => 'prompts_submitted',
                'mobile_chat_prompt_sent' => 'chat_prompts',
                'mobile_project_prompt_sent' => 'project_prompts',
                default => null,
            };
            if ($key !== null && isset($series[$row->surface][$row->day][$key])) {
                $series[$row->surface][$row->day][$key] += (int) $row->total;
            }
        }
        foreach (['desktop', 'mobile'] as $surface) {
            $dailyUsers = (clone $events)->where('surface', $surface)
                ->selectRaw("DATE(occurred_at) as day, COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id ELSE 's:' || consent_subject_hash END) as total")
                ->groupByRaw('DATE(occurred_at)')->get();
            foreach ($dailyUsers as $row) {
                if (isset($series[$surface][$row->day])) {
                    $series[$surface][$row->day]['active_users'] = (int) $row->total;
                }
            }
        }
        $dailyVisitors = (clone $events)->where('event', 'website_page_view')
            ->selectRaw('DATE(occurred_at) as day, COUNT(DISTINCT visitor_hash) as total')
            ->groupByRaw('DATE(occurred_at)')->get();
        foreach ($dailyVisitors as $row) {
            if (isset($series['website'][$row->day])) {
                $series['website'][$row->day]['unique_visitors'] = (int) $row->total;
            }
        }
        $users = DB::table('users');
        $hasGuestAccounts = Schema::hasColumn('users', 'guest_at');
        $hasVibesTurns = Schema::hasTable('vibes_turns');
        $turns = $hasVibesTurns ? DB::table('vibes_turns')->whereBetween('created_at', [$from, $to]) : null;
        $turnTotals = $turns ? (clone $turns)->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed")
            ->selectRaw("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed")
            ->selectRaw('COALESCE(SUM(actual_micro_usd), 0) as spend')->first() : null;
        $overview = [
            'website' => [
                'page_views' => $tracking['website'] ? $this->sum($series['website'], 'page_views') : null,
                'unique_visitors' => $tracking['website'] ? (clone $events)->where('event', 'website_page_view')->distinct()->count('visitor_hash') : null,
                'signups' => $tracking['website'] ? $this->sum($series['website'], 'signups') : null,
                'downloads' => $tracking['website'] ? $this->sum($series['website'], 'downloads') : null,
            ],
            'desktop' => [
                'active_users' => $tracking['desktop'] ? (clone $events)->where('surface', 'desktop')->selectRaw("COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id ELSE 's:' || consent_subject_hash END) as total")->value('total') : null,
                'app_opens' => $tracking['desktop'] ? $this->sum($series['desktop'], 'app_opens') : null,
                'projects_created' => $tracking['desktop'] ? (clone $events)->where('event', 'desktop_project_created')->count() : null,
                'terminals_started' => $tracking['desktop'] ? (clone $events)->where('event', 'desktop_terminal_started')->count() : null,
                'prompts_submitted' => $tracking['desktop'] ? $this->sum($series['desktop'], 'prompts_submitted') : null,
            ],
            'mobile' => [
                'active_users' => $tracking['mobile'] ? (clone $events)->where('surface', 'mobile')->selectRaw("COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id ELSE 's:' || consent_subject_hash END) as total")->value('total') : null,
                'app_opens' => $tracking['mobile'] ? $this->sum($series['mobile'], 'app_opens') : null,
                'chat_prompts' => $tracking['mobile'] ? $this->sum($series['mobile'], 'chat_prompts') : null,
                'project_prompts' => $tracking['mobile'] ? $this->sum($series['mobile'], 'project_prompts') : null,
            ],
            'accounts' => [
                'total' => (clone $users)->count(),
                'registered' => $hasGuestAccounts ? (clone $users)->whereNull('guest_at')->count() : (clone $users)->count(),
                'guests' => $hasGuestAccounts ? (clone $users)->whereNotNull('guest_at')->count() : null,
                'new' => (clone $users)->whereBetween('created_at', [$from, $to])->count(),
                'active_30d' => DB::table('vibyra_sessions')->where('last_used_at', '>=', $to->copy()->subDays(30))
                    ->distinct()->count('user_id'),
            ],
            'ai' => [
                'vibes_turns' => $hasVibesTurns ? (int) ($turnTotals->total ?? 0) : null,
                'completed_turns' => $hasVibesTurns ? (int) ($turnTotals->completed ?? 0) : null,
                'failed_turns' => $hasVibesTurns ? (int) ($turnTotals->failed ?? 0) : null,
                'spend_micro_usd' => $hasVibesTurns ? (int) ($turnTotals->spend ?? 0) : null,
            ],
        ];
        foreach ($series as $surface => &$rows) {
            $rows = $tracking[$surface] ? array_values($rows) : [];
        }
        unset($rows);
        $report = [
            'range' => ['days' => $days, 'from' => $from->toIso8601String(), 'to' => $to->toIso8601String()],
            'overview' => $overview,
            'series' => $series,
            'breakdowns' => [
                'website_pages' => $this->dimensions($events, 'website_page_view', 'path'),
                'downloads' => $this->dimensions($events, 'website_download', 'platform'),
                'desktop_events' => $this->eventCounts($events, 'desktop'),
                'mobile_events' => $this->eventCounts($events, 'mobile'),
                'desktop_platforms' => $this->propertyCounts($events, 'desktop_app_opened', 'platform'),
                'desktop_providers' => $this->propertyCounts($events, 'desktop_terminal_started', 'provider'),
                'desktop_prompt_providers' => $this->propertyCounts($events, 'desktop_prompt_submitted', 'provider'),
                'desktop_project_kinds' => $this->propertyCounts($events, 'desktop_project_created', 'project_kind'),
                'mobile_platforms' => $this->propertyCounts($events, 'mobile_app_opened', 'platform'),
                'mobile_screens' => $this->propertyCounts($events, 'mobile_screen_viewed', 'screen'),
                'mobile_chat_efforts' => $this->propertyCounts($events, 'mobile_chat_prompt_sent', 'effort'),
                'mobile_project_providers' => $this->propertyCounts($events, 'mobile_project_prompt_sent', 'provider'),
                'models' => $this->models($events),
                'memberships' => $this->memberships($hasGuestAccounts),
                'prompt_models' => $turns ? (clone $turns)->select('model')->selectRaw('COUNT(*) as count')
                    ->groupBy('model')->orderByDesc('count')->limit(12)->get()->all() : [],
            ],
            'data_quality' => [
                'tracking_started_at' => DB::table('analytics_events')->min('created_at'),
                'tracking_by_surface' => $tracking,
                'last_event_by_surface' => $lastEvent,
                'retention_days' => (int) config('owner_analytics.retention_days', 400),
                'cloud_turns_available' => $hasVibesTurns,
                'notes' => [
                    'The tracking date is the oldest retained metadata event; events older than the retention window are deleted daily.',
                    'Website page views require analytics consent; people who decline or leave before choosing are not counted.',
                    'Website visitors are distinct browser sessions, not verified people.',
                    'Page views can include bots; traffic analytics are approximate.',
                    'Downloads count accepted public attachment responses, not completed installations; shared update URLs can contribute.',
                    'Desktop and mobile telemetry starts when the instrumented clients ship; historical sessions cannot identify a surface reliably.',
                    'Client events are best effort and can be missed or manipulated; cloud AI totals come from server records.',
                    'AI turn totals cover Vibes cloud chat; desktop provider usage may occur locally and is represented by submitted-prompt events only.',
                    'Completed installations and recognized revenue are unavailable: download responses and membership state do not establish those totals.',
                    ...(! array_filter($tracking) ? ['Website, Desktop, and Mobile historical usage were not tracked before this analytics rollout. A dash means unavailable, not zero.'] : []),
                    ...($hasVibesTurns ? [] : ['This website database has no Vibes cloud turn ledger. Cloud prompt and spend metrics are unavailable on this deployment.']),
                ],
            ],
        ];
        return app(OwnerReportExtras::class)->apply($report, $from, $to, $tracking);
    }
    private function blankSeries(Carbon $from, int $days): array
    {
        $series = ['website' => [], 'desktop' => [], 'mobile' => []];
        for ($day = 0; $day < $days; $day++) {
            $date = $from->copy()->addDays($day)->toDateString();
            $series['website'][$date] = ['date' => $date, 'page_views' => 0, 'unique_visitors' => 0, 'signups' => 0, 'downloads' => 0];
            $series['desktop'][$date] = ['date' => $date, 'active_users' => 0, 'app_opens' => 0, 'prompts_submitted' => 0];
            $series['mobile'][$date] = ['date' => $date, 'active_users' => 0, 'app_opens' => 0, 'chat_prompts' => 0, 'project_prompts' => 0];
        }
        return $series;
    }
    private function sum(array $series, string $key): int
    {
        return array_sum(array_column($series, $key));
    }
    private function dimensions($events, string $event, string $field): array
    {
        return (clone $events)->where('event', $event)->whereNotNull('dimension')
            ->select("dimension as {$field}")->selectRaw('COUNT(*) as count')
            ->groupBy('dimension')->orderByDesc('count')->get()->all();
    }
    private function eventCounts($events, string $surface): array
    {
        return (clone $events)->where('surface', $surface)->select('event')
            ->selectRaw('COUNT(*) as count')->groupBy('event')->orderByDesc('count')->get()->all();
    }
    private function propertyCounts($events, string $event, string $property): array
    {
        return (clone $events)->where('event', $event)->whereNotNull($property)
            ->select($property)->selectRaw('COUNT(*) as count')
            ->groupBy($property)->orderByDesc('count')->limit(12)->get()->all();
    }
    private function models($events): array
    {
        return (clone $events)->whereIn('event', ['desktop_prompt_submitted', 'mobile_chat_prompt_sent'])
            ->whereNotNull('dimension')->select('surface', 'dimension as model')
            ->selectRaw('COUNT(*) as count')->groupBy('surface', 'dimension')
            ->orderByDesc('count')->limit(12)->get()->all();
    }

    private function memberships(bool $hasGuestAccounts): array
    {
        $users = DB::table('users');
        if ($hasGuestAccounts) {
            $users->whereNull('guest_at');
        }
        return $users->select('plan')->selectRaw('COUNT(*) as count')
            ->groupBy('plan')->orderByDesc('count')->get()->all();
    }
}
