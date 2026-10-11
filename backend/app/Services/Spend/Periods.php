<?php

namespace App\Services\Spend;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/** Calendar day and month in the person's timezone (UTC when none is saved). Pure date maths, no database. */
final class Periods
{
    public const KINDS = ['day', 'month'];

    public static function zone(?string $tz): string
    {
        return $tz && in_array($tz, \DateTimeZone::listIdentifiers(), true) ? $tz : 'UTC';
    }

    /** [start, end) as UTC instants of the period that contains `$at`. */
    public static function bounds(string $kind, ?string $tz, ?CarbonInterface $at = null): array
    {
        $local = Carbon::instance(($at ?? now())->toDateTime())->setTimezone(self::zone($tz));
        $start = $kind === 'month' ? $local->copy()->startOfMonth() : $local->copy()->startOfDay();
        $end = $kind === 'month' ? $start->copy()->addMonthNoOverflow() : $start->copy()->addDay();
        return [$start->utc(), $end->utc()];
    }

    /** "00:00 tomorrow" or "1 November": the moment the counter returns to zero, in the person's own clock. */
    public static function resetWords(string $kind, ?string $tz, CarbonInterface $end): string
    {
        $local = Carbon::instance($end->toDateTime())->setTimezone(self::zone($tz));
        return $kind === 'month' ? $local->format('j F') : $local->format('H:i').' tomorrow';
    }
}
