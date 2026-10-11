<?php

namespace App\Services\Spend;

use App\Services\CloudWorkspaces\Allowance;
use App\Services\Notifications\Preferences;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Read and write a person's caps, the alerts switch and the cloud included-hours choice. */
final class Settings
{
    private const COLUMNS = ['day' => 'cap_day_units', 'month' => 'cap_month_units', 'run' => 'cap_run_units'];

    public function __construct(private readonly Counters $counters) {}

    public function payload(int $user): array
    {
        if (!SpendCaps::enabled()) return ['enabled' => false];
        $w = app(SpendCaps::class)->wallet($user);
        $tz = Periods::zone($w->cap_timezone ?? app(Preferences::class)->get($user)->timezone);
        $meters = [];
        foreach (Periods::KINDS as $kind) {
            $row = $this->counters->peek($user, $kind);
            $limit = $w->{self::COLUMNS[$kind]};
            $end = $row ? Carbon::parse($row->ends_at, 'UTC') : Periods::bounds($kind, $tz)[1];
            $meters[$kind] = ['limit' => $limit === null ? null : Refusal::tokens((int) $limit + (int) ($row->raised_units ?? 0)),
                'used' => Refusal::tokens($row ? (int) $row->held + (int) $row->spent : 0),
                'raisedBy' => Refusal::tokens((int) ($row->raised_units ?? 0)),
                'resetsAt' => $end->toIso8601String(), 'resetsLabel' => Periods::resetWords($kind, $tz, $end)];
        }
        return ['enabled' => true, 'unit' => 'tokens', 'timezone' => $tz, 'presets' => config('spend_caps.presets'),
            'maxTokens' => (int) config('spend_caps.max_tokens'), ...$meters,
            'run' => ['limit' => $w->cap_run_units === null ? null : Refusal::tokens((int) $w->cap_run_units)],
            'alerts' => (bool) app(Preferences::class)->get($user)->spend,
            'cloud' => ['hasIncludedHours' => app(Allowance::class)->allowanceSeconds($user) > 0,
                'whenHoursRunOut' => $w->cloud_hours_overage ?? 'default', 'default' => config('cloud_workspaces.overage') === 'blocked' ? 'stop' : 'tokens']];
    }

    /** Only the keys present are changed; a present null switches that cap off. Tokens in, canonical units stored. */
    public function save(int $user, array $d): array
    {
        if (array_key_exists('month', $d)) app(\App\Services\Teams\MemberCaps::class)->assertMayChange($user, $d['month']); // a team's per-member ceiling (Teams, default off)
        DB::transaction(function () use ($user, $d) {
            $w = app(Wallet::class)->lock($user);
            $update = [];
            foreach (self::COLUMNS as $kind => $column) {
                if (!array_key_exists($kind, $d)) continue;
                $update[$column] = $d[$kind] === null ? null : (int) round($d[$kind] * \App\Services\Membership\Units::SCALE);
                if ($update[$column] != $w->{$column} && $kind !== 'run') $this->counters->reset($user, $kind);
            }
            if (!empty($d['timezone'])) $update['cap_timezone'] = Periods::zone($d['timezone']);
            elseif ($w->cap_timezone === null) $update['cap_timezone'] = Periods::zone(app(Preferences::class)->get($user)->timezone);
            if (array_key_exists('cloudIncludedHours', $d)) $update['cloud_hours_overage'] = $d['cloudIncludedHours'];
            if ($update) DB::table('vibes_wallets')->where('user_id', $user)->update($update + ['updated_at' => now()]);
            if (isset($d['alerts'])) {
                app(Preferences::class)->get($user);
                DB::table('notification_preferences')->where('user_id', $user)->update(['spend' => (bool) $d['alerts'], 'revision' => DB::raw('revision + 1')]);
            }
        }, 3);
        \App\Services\Platform\AccountActivity::record($user, 'spend_cap.changed', array_map(fn ($v) => $v ?? 'off',
            array_intersect_key($d, ['day' => 1, 'month' => 1, 'run' => 1])));
        return $this->payload($user);
    }

    /** One tap: this period's limit goes up by `$tokens`, or by its own size when none is given. Recorded on the period row. */
    public function raise(int $user, string $kind, ?float $tokens): array
    {
        app(\App\Services\Teams\MemberCaps::class)->assertMayRaise($user, $kind);
        DB::transaction(function () use ($user, $kind, $tokens) {
            $w = app(Wallet::class)->lock($user);
            $cap = $w->{self::COLUMNS[$kind]};
            abort_if($cap === null, 422, 'There is no '.($kind === 'day' ? 'daily' : 'monthly').' limit to raise.');
            $by = $tokens === null ? (int) $cap : (int) round($tokens * \App\Services\Membership\Units::SCALE);
            $row = $this->counters->current($user, $kind, $w->cap_timezone);
            $max = (int) config('spend_caps.max_tokens') * \App\Services\Membership\Units::SCALE;
            DB::table('wallet_spend_periods')->where('id', $row->id)->update(
                ['raised_units' => min($max, (int) $row->raised_units + $by), 'raised_at' => now(), 'alerted_warn' => false, 'alerted_full' => false]);
        }, 3);
        \App\Services\Platform\AccountActivity::record($user, 'spend_cap.changed', ['raised' => $kind]);
        return $this->payload($user);
    }
}
