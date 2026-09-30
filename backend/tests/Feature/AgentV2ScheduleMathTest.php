<?php

namespace Tests\Feature;

use App\Services\AgentSchedules\Recurrence;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AgentV2ScheduleMathTest extends TestCase
{
    private const LONDON = 'Europe/London';

    private function utc(string $at): CarbonImmutable
    {
        return CarbonImmutable::parse($at, 'UTC');
    }

    public function test_daily_wall_clock_time_keeps_its_local_hour_across_both_london_transitions(): void
    {
        $r = Recurrence::normalize(['type' => 'daily', 'time' => '09:00'], self::LONDON);
        $spring = Recurrence::upcoming($r, self::LONDON, $this->utc('2026-03-28 06:00'), 2);
        $this->assertSame(['2026-03-28T09:00:00+00:00', '2026-03-29T08:00:00+00:00'], array_map(fn ($d) => $d->toIso8601String(), $spring),
            'Before the change 09:00 London is 09:00 UTC; after it, 08:00 UTC.');
        $autumn = Recurrence::upcoming($r, self::LONDON, $this->utc('2026-10-24 12:00'), 2);
        $this->assertSame(['2026-10-25T09:00:00+00:00', '2026-10-26T09:00:00+00:00'], array_map(fn ($d) => $d->toIso8601String(), $autumn));
        $this->assertSame('2026-10-24T08:00:00+00:00', Recurrence::next($r, self::LONDON, $this->utc('2026-10-24 07:00'))->toIso8601String());
    }

    public function test_a_nonexistent_local_time_is_skipped_for_that_day_only(): void
    {
        // 29 March 2026: London clocks jump 01:00 → 02:00, so 01:30 does not exist.
        $r = Recurrence::normalize(['type' => 'daily', 'time' => '01:30'], self::LONDON);
        $next = Recurrence::upcoming($r, self::LONDON, $this->utc('2026-03-28 02:00'), 2);
        $this->assertSame(['2026-03-30T00:30:00+00:00', '2026-03-31T00:30:00+00:00'], array_map(fn ($d) => $d->toIso8601String(), $next));
        $this->assertNull(Recurrence::at('2026-03-29', '01:30', self::LONDON));
        $this->expectException(ValidationException::class);
        Recurrence::normalize(['type' => 'once', 'date' => '2026-03-29', 'time' => '01:30'], self::LONDON);
    }

    public function test_an_ambiguous_local_time_runs_once_at_its_first_instant(): void
    {
        // 25 October 2026: London clocks go 02:00 BST → 01:00 GMT, so 01:30 happens twice.
        $r = Recurrence::normalize(['type' => 'daily', 'time' => '01:30'], self::LONDON);
        $next = Recurrence::upcoming($r, self::LONDON, $this->utc('2026-10-24 12:00'), 2);
        $this->assertSame(['2026-10-25T00:30:00+00:00', '2026-10-26T01:30:00+00:00'], array_map(fn ($d) => $d->toIso8601String(), $next),
            'Only the first 01:30 (BST) runs; the repeated 01:30 GMT is not a second occurrence.');
        $this->assertSame('2026-10-26T01:30:00+00:00', Recurrence::next($r, self::LONDON, $this->utc('2026-10-25 00:30'))->toIso8601String());
    }

    public function test_weekly_weekdays_and_one_off_times(): void
    {
        $weekly = Recurrence::normalize(['type' => 'weekly', 'weekdays' => [5, 1, 1], 'time' => '18:15'], 'America/New_York');
        $this->assertSame([1, 5], $weekly['weekdays']);
        // 2026-09-30 is a Wednesday.
        $next = Recurrence::upcoming($weekly, 'America/New_York', $this->utc('2026-09-30 12:00'), 3);
        $this->assertSame(['2026-10-02T22:15:00+00:00', '2026-10-05T22:15:00+00:00', '2026-10-09T22:15:00+00:00'],
            array_map(fn ($d) => $d->toIso8601String(), $next));
        $once = Recurrence::normalize(['type' => 'once', 'date' => '2026-10-01', 'time' => '07:00'], self::LONDON);
        $this->assertSame('2026-10-01T06:00:00+00:00', Recurrence::next($once, self::LONDON, $this->utc('2026-09-30 00:00'))->toIso8601String());
        $this->assertNull(Recurrence::next($once, self::LONDON, $this->utc('2026-10-01 06:00')));
        $this->assertSame('Every Mon, Fri at 18:15', Recurrence::describe($weekly));
    }

    public function test_invalid_recurrences_are_refused(): void
    {
        foreach ([[['type' => 'hourly', 'time' => '09:00'], 'UTC'], [['type' => 'daily', 'time' => '9am'], 'UTC'],
            [['type' => 'weekly', 'weekdays' => [], 'time' => '09:00'], 'UTC'], [['type' => 'weekly', 'weekdays' => [8], 'time' => '09:00'], 'UTC'],
            [['type' => 'daily', 'time' => '09:00'], 'Mars/Olympus'], [['type' => 'once', 'date' => '2026-02-30', 'time' => '09:00'], 'UTC']] as [$r, $tz]) {
            try {
                Recurrence::normalize($r, $tz);
                $this->fail('Accepted '.json_encode($r).' in '.$tz);
            } catch (ValidationException) {
                $this->addToAssertionCount(1);
            }
        }
    }
}
