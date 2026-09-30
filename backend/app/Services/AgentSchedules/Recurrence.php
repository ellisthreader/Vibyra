<?php

namespace App\Services\AgentSchedules;

use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * Wall-clock recurrence in an IANA timezone, computed on the server.
 *
 * - `once`: one local date + time. `daily`: every day. `weekly`: ISO weekdays (1 = Monday).
 * - DST: a local time that does not exist that day (spring forward) is skipped for that day;
 *   a local time that happens twice (fall back) runs once, at its first instant.
 */
final class Recurrence
{
    /** @return array{type: string, time: string, date?: string, weekdays?: int[]} normalized, or 422 */
    public static function normalize(mixed $recurrence, mixed $timezone): array
    {
        self::zone($timezone);
        $r = is_array($recurrence) ? $recurrence : [];
        $type = $r['type'] ?? null;
        if (!in_array($type, ['once', 'daily', 'weekly'], true)) self::fail('recurrence.type', 'Choose once, daily or weekly.');
        $time = $r['time'] ?? null;
        if (!is_string($time) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/D', $time)) self::fail('recurrence.time', 'Give a time as HH:MM.');
        $out = ['type' => $type, 'time' => $time];
        if ($type === 'once') {
            $date = $r['date'] ?? null;
            if (!is_string($date) || !preg_match('/^\d{4}-\d\d-\d\d$/D', $date) || !checkdate((int) substr($date, 5, 2),
                (int) substr($date, 8, 2), (int) substr($date, 0, 4))) self::fail('recurrence.date', 'Give a date as YYYY-MM-DD.');
            $out['date'] = $date;
            if (self::at($date, $time, $timezone) === null)
                self::fail('recurrence.time', 'That time does not exist on that day in this timezone (clocks change).');
        }
        if ($type === 'weekly') {
            $days = $r['weekdays'] ?? null;
            if (!is_array($days) || !array_is_list($days) || $days === []) self::fail('recurrence.weekdays', 'Choose at least one weekday.');
            foreach ($days as $d) if (!is_int($d) || $d < 1 || $d > 7) self::fail('recurrence.weekdays', 'Weekdays are 1 (Monday) to 7 (Sunday).');
            $days = array_values(array_unique($days));
            sort($days);
            $out['weekdays'] = $days;
        }
        return $out;
    }

    public static function zone(mixed $timezone): string
    {
        if (!is_string($timezone) || !in_array($timezone, \DateTimeZone::listIdentifiers(), true))
            self::fail('timezone', 'Give an IANA timezone such as Europe/London.');
        return $timezone;
    }

    /** The first occurrence strictly after `$after`, or null when there is none (a past one-off). */
    public static function next(array $r, string $timezone, CarbonImmutable $after): ?CarbonImmutable
    {
        if ($r['type'] === 'once') {
            $at = self::at($r['date'], $r['time'], $timezone);
            return $at && $at->greaterThan($after) ? $at : null;
        }
        $day = $after->setTimezone($timezone)->startOfDay()->subDay();
        for ($i = 0; $i < 16; $i++, $day = $day->addDay()) {
            if ($r['type'] === 'weekly' && !in_array($day->isoWeekday(), $r['weekdays'], true)) continue;
            $at = self::at($day->format('Y-m-d'), $r['time'], $timezone);
            if ($at && $at->greaterThan($after)) return $at;
        }
        return null;
    }

    /** @return CarbonImmutable[] up to `$count` upcoming occurrences, for the preview */
    public static function upcoming(array $r, string $timezone, CarbonImmutable $after, int $count): array
    {
        $out = [];
        while (count($out) < $count && ($after = self::next($r, $timezone, $after))) $out[] = $after;
        return $out;
    }

    /** The latest occurrence at or before `$now`, walking from a known due `$from` (bounded). */
    public static function latestDue(array $r, string $timezone, CarbonImmutable $from, CarbonImmutable $now): CarbonImmutable
    {
        $latest = $from;
        for ($i = 0; $i < 4000 && ($n = self::next($r, $timezone, $latest)) && $n->lessThanOrEqualTo($now); $i++) $latest = $n;
        return $latest;
    }

    /** The UTC instant of a local date + time, the first of two when ambiguous, null when nonexistent. */
    public static function at(string $date, string $time, string $timezone): ?CarbonImmutable
    {
        $wanted = $date.' '.$time;
        $at = CarbonImmutable::createFromFormat('Y-m-d H:i|', $wanted, $timezone);
        if (!$at || $at->format('Y-m-d H:i') !== $wanted) return null;
        $earlier = $at->subHour();
        if ($earlier->format('Y-m-d H:i') === $wanted) $at = $earlier;
        return $at->utc();
    }

    public static function describe(array $r): string
    {
        $names = [1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat', 7 => 'Sun'];
        return match ($r['type']) {
            'once' => 'Once on '.$r['date'].' at '.$r['time'],
            'daily' => 'Every day at '.$r['time'],
            default => 'Every '.implode(', ', array_map(fn ($d) => $names[$d], $r['weekdays'])).' at '.$r['time'],
        };
    }

    private static function fail(string $field, string $message): never
    {
        throw ValidationException::withMessages([$field => $message]);
    }
}
