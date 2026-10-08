<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\CalendarTools;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Calendar input/coverage regressions; all provider responses are fixtures. */
class AgentV2CalendarReadinessTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const API = '#www\.googleapis\.com/calendar/v3';
    private const WINDOW = ['timeMin' => '2026-10-25T00:00:00+01:00', 'timeMax' => '2026-10-26T00:00:00Z',
        'timeZone' => 'Europe/London'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_impossible_dates_and_out_of_range_clock_or_offset_are_refused_without_normalization(): void
    {
        foreach (['2026-02-30T10:00:00Z', '2026-02-29T10:00:00Z', '2026-04-31T10:00:00Z',
            '0000-01-01T10:00:00Z', '2026-10-25T24:00:00Z', '2026-10-25T10:60:00Z',
            '2026-10-25T10:00:60Z', '2026-10-25T10:00:00+24:00', '2026-10-25T10:00:00+01:60',
            '2026-10-25T10:00:00', '2026-10-25'] as $invalid) {
            try { CalendarTools::instant($invalid, 'start'); }
            catch (HttpException $e) { $this->assertSame(422, $e->getStatusCode()); continue; }
            $this->fail('Accepted invalid instant: '.$invalid);
        }
        $this->assertSame('2028-02-29T10:00:00+00:00', CalendarTools::instant('2028-02-29T10:00Z', 'start')->toIso8601String());
        $before = CalendarTools::instant('2026-10-25T01:30:00+01:00', 'start');
        $after = CalendarTools::instant('2026-10-25T01:30:00Z', 'end');
        $this->assertEquals(60, $before->diffInMinutes($after), 'Repeated DST wall-clock times are distinct instants.');
    }

    public function test_all_day_dates_and_pagination_survive_with_the_selected_calendar_and_account(): void
    {
        $connection = $this->providerInstall('google_calendar', 'owner@example.com', 'selected-cal-token');
        $this->grant($connection, ['google_calendar_list_events']);
        $this->admit();
        $claimed = $this->claim();
        $this->route('GET', self::API.'/calendars/team@example.com/events\?#', Http::response([
            'timeZone' => 'Europe/London', 'nextPageToken' => 'page-2', 'items' => [
                ['id' => 'all-day', 'summary' => 'Leave', 'start' => ['date' => '2026-10-25'], 'end' => ['date' => '2026-10-26']]] ]));
        $this->callTool($claimed, 'google_calendar_list_events', $connection,
            ['calendarId' => 'team@example.com', 'pageToken' => 'page-1'] + self::WINDOW, 'r1')->assertOk()
            ->assertJsonPath('action.result.calendarId', 'team@example.com')->assertJsonPath('action.result.events.0.allDay', true)
            ->assertJsonPath('action.result.events.0.start', '2026-10-25')->assertJsonPath('action.result.events.0.end', '2026-10-26')
            ->assertJsonPath('action.result.hasMore', true)->assertJsonPath('action.result.nextPageToken', 'page-2');
        Http::assertSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer selected-cal-token') && $r['pageToken'] === 'page-1'
            && $r['timeMin'] === self::WINDOW['timeMin'] && $r['timeMax'] === '2026-10-26T00:00:00+00:00');
    }

    public function test_busy_coverage_never_describes_truncated_or_missing_intervals_as_free_time(): void
    {
        $connection = $this->providerInstall('google_calendar', 'owner@example.com', 'cal-token');
        $this->grant($connection, ['google_calendar_freebusy']);
        $this->admit();
        $claimed = $this->claim();
        $busy = array_fill(0, 201, ['start' => '2026-10-25T10:00:00Z', 'end' => '2026-10-25T10:30:00Z']);
        $this->route('POST', self::API.'/freeBusy#', Http::response(['calendars' => [
            'primary' => ['busy' => $busy], 'empty@example.com' => ['busy' => []], 'missing@example.com' => [],
            'denied@example.com' => ['errors' => [['reason' => 'notFound']]]]]));
        $this->callTool($claimed, 'google_calendar_freebusy', $connection,
            ['calendarIds' => ['primary', 'empty@example.com', 'missing@example.com', 'denied@example.com']] + self::WINDOW, 'r1')
            ->assertOk()->assertJsonCount(200, 'action.result.calendars.0.busy')
            ->assertJsonPath('action.result.calendars.0.truncated', true)
            ->assertJsonPath('action.result.calendars.0.coverage', 'Partial: use a smaller time window before inferring free time.')
            ->assertJsonPath('action.result.calendars.1.coverage', 'Complete.')
            ->assertJsonPath('action.result.calendars.2.error', 'missing')
            ->assertJsonPath('action.result.calendars.2.coverage', 'Unavailable: do not infer free time.')
            ->assertJsonPath('action.result.calendars.3.error', 'notFound');
    }
}
