<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\CalendarWrites;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Google Calendar through the V2 broker: explicit calendar/timezone, free/busy, idempotent approved create (fixtures). */
class AgentV2CalendarToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const API = '#www\.googleapis\.com/calendar/v3';
    private const EVENT = ['calendarId' => 'primary', 'title' => 'Sync on issue 7', 'start' => '2026-10-02T15:00:00+01:00',
        'end' => '2026-10-02T15:30:00+01:00', 'timeZone' => 'Europe/London'];
    private string $conn;
    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->conn = $this->providerInstall('google_calendar', 'owner@example.com', 'cal-token');
    }

    private function start(array $ops): array
    {
        $this->grant($this->conn, $ops);
        $run = $this->admit('Find a slot and book it.');
        $this->claimed = $this->claim();
        return $run;
    }

    private function cal(string $tool, array $args, string $callId)
    {
        return $this->callTool($this->claimed, $tool, $this->conn, $args, $callId)->assertOk();
    }

    private function created(array $request, string $id): array
    {
        return ['id' => $id, 'status' => 'confirmed', 'summary' => $request['summary'], 'start' => $request['start'],
            'end' => $request['end'], 'htmlLink' => 'https://calendar.google.com/event?eid='.$id];
    }

    public function test_reads_use_an_explicit_calendar_window_and_timezone(): void
    {
        $this->start(['google_calendar_freebusy', 'google_calendar_list_calendars', 'google_calendar_list_events']);
        $this->route('GET', self::API.'/users/me/calendarList#', Http::response(['items' => [['id' => 'owner@example.com',
            'summary' => 'Owner', 'primary' => true, 'accessRole' => 'owner', 'timeZone' => 'Europe/London']], 'nextPageToken' => 'p2']));
        $this->route('GET', self::API.'/calendars/primary/events\?#', fn ($r) => Http::response(['timeZone' => $r['timeZone'],
            'items' => [['id' => 'e1', 'summary' => 'Standup', 'start' => ['dateTime' => '2026-10-02T09:00:00+01:00'],
                'end' => ['dateTime' => '2026-10-02T09:15:00+01:00']]]]));
        $this->route('POST', self::API.'/freeBusy#', fn ($r) => Http::response(['calendars' => [
            'primary' => ['busy' => [['start' => '2026-10-02T09:00:00+01:00', 'end' => '2026-10-02T09:15:00+01:00']]],
            'team@example.com' => ['errors' => [['domain' => 'global', 'reason' => 'notFound']]]]]));
        $this->cal('google_calendar_list_calendars', [], 'r1')->assertJsonPath('action.result.calendars.0.accessRole', 'owner')
            ->assertJsonPath('action.result.hasMore', true)->assertJsonPath('action.result.nextPageToken', 'p2');
        $window = ['timeMin' => '2026-10-02T00:00:00+01:00', 'timeMax' => '2026-10-03T00:00:00+01:00', 'timeZone' => 'Europe/London'];
        $this->cal('google_calendar_list_events', ['calendarId' => 'primary'] + $window, 'r2')
            ->assertJsonPath('action.result.events.0.title', 'Standup')->assertJsonPath('action.result.timeZone', 'Europe/London')
            ->assertJsonPath('action.result.hasMore', false);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/events?') && $r['timeZone'] === 'Europe/London'
            && $r['singleEvents'] === 'true');
        $busy = $this->cal('google_calendar_freebusy', ['calendarIds' => ['primary', 'team@example.com']] + $window, 'r3');
        $busy->assertJsonPath('action.result.calendars.0.busy.0.start', '2026-10-02T09:00:00+01:00')
            ->assertJsonPath('action.result.calendars.1.error', 'notFound');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/freeBusy') && $r['items'] === [['id' => 'primary'], ['id' => 'team@example.com']]);
        foreach ([array_replace(['calendarId' => 'primary'] + $window, ['timeZone' => 'Mars/Base']), ['calendarId' => 'primary', 'timeMin' => '2026-10-02',
            'timeMax' => '2026-10-03', 'timeZone' => 'UTC'], $window, ['calendarId' => 'primary'] + array_replace($window, ['timeMax' => '2026-12-30T00:00:00Z'])]
            as $i => $bad)
            $this->cal('google_calendar_list_events', $bad, 'bad'.$i)->assertJsonPath('action.result.reason', 'invalid_arguments');
    }

    public function test_create_waits_for_approval_uses_an_action_derived_id_and_invites_nobody(): void
    {
        $run = $this->start(['google_calendar_create_event']);
        $this->route('POST', self::API.'/calendars/primary/events#', fn ($r) => Http::response($this->created($r->data(), $r['id'])));
        $action = $this->cal('google_calendar_create_event', self::EVENT + ['attendees' => ['x@example.com']], 'w0')
            ->assertJsonPath('action.result.reason', 'invalid_arguments')->json('action');
        $action = $this->cal('google_calendar_create_event', self::EVENT, 'w1')->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->assertSame('waiting_for_approval', $this->runState($run['id']));
        $this->assertSame(0, $this->sent('POST', self::API.'#'));
        $eventId = CalendarWrites::eventId($action['id']);
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.receipt.providerResourceId', $eventId)->assertJsonPath('action.receipt.outcome', 'confirmed')
            ->assertJsonPath('action.result.start', '2026-10-02T15:00:00+01:00');
        Http::assertSent(fn ($r) => $r->method() === 'POST' && str_contains($r->url(), 'sendUpdates=none') && $r['id'] === $eventId
            && $r['summary'] === 'Sync on issue 7' && $r['start'] === ['dateTime' => '2026-10-02T15:00:00+01:00', 'timeZone' => 'Europe/London']
            && !isset($r['attendees']));
        $this->assertMatchesRegularExpression('/^[a-v0-9]{5,1024}$/', $eventId);
        $this->assertDatabaseHas('agent_receipts', ['action_id' => $action['id'], 'idempotency_key' => $eventId]);
    }

    public function test_a_lost_response_is_reconciled_by_its_own_event_id_and_a_replay_is_deduplicated(): void
    {
        $this->start(['google_calendar_create_event']);
        $stored = [];
        $this->route('POST', self::API.'/calendars/primary/events#', function ($r) use (&$stored) {
            $stored[$r['id']] = $this->created($r->data(), $r['id']);
            return (Http::failedConnection())($r); // Google committed it, the answer was lost.
        });
        $this->route('GET', self::API.'/calendars/primary/events/vb#', function ($r) use (&$stored) {
            $found = $stored[basename(parse_url($r->url(), PHP_URL_PATH))] ?? null;
            return $found ? Http::response($found) : Http::response(['error' => 'notFound'], 404);
        });
        $action = $this->cal('google_calendar_create_event', self::EVENT, 'w1')->json('action');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.result.reconciled', true)->assertJsonPath('action.receipt.status', 'confirmed');
        $this->assertSame(1, $this->sent('POST', self::API.'/calendars/primary/events#'));
        // Google answering 409 for our own id means the first attempt landed: confirm, never duplicate.
        $this->route('POST', self::API.'/calendars/primary/events#', function ($r) use (&$stored) {
            if (isset($stored[$r['id']])) return Http::response(['error' => ['code' => 409, 'message' => 'duplicate']], 409);
            $stored[$r['id']] = $this->created($r->data(), $r['id']);
            return Http::response($stored[$r['id']]);
        });
        $second = $this->cal('google_calendar_create_event', array_replace(self::EVENT, ['title' => 'Second']), 'w2')->json('action');
        $stored[CalendarWrites::eventId($second['id'])] = $this->created(['summary' => 'Second', 'start' => ['dateTime' => self::EVENT['start']],
            'end' => ['dateTime' => self::EVENT['end']]], CalendarWrites::eventId($second['id']));
        $this->decide($second)->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.receipt.providerResourceId', CalendarWrites::eventId($second['id']));
    }

    public function test_an_unconfirmed_create_stays_unknown_ends_the_run_outcome_unknown_and_is_not_retried(): void
    {
        $run = $this->start(['google_calendar_create_event']);
        $this->route('POST', self::API.'/calendars/primary/events#', Http::response(['error' => 'backendError'], 503));
        $this->route('GET', self::API.'/calendars/primary/events/vb#', Http::response(['error' => 'notFound'], 404));
        $action = $this->cal('google_calendar_create_event', self::EVENT, 'w1')->json('action');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'unknown')
            ->assertJsonPath('action.result.outcome', 'outcome_unknown');
        $this->assertDatabaseHas('agent_run_events', ['run_id' => $run['id'], 'type' => 'tool.result']);
        $this->cal('google_calendar_create_event', self::EVENT, 'w2')->assertJsonPath('action.result.reason', 'outcome_unknown');
        $this->assertSame(1, $this->sent('POST', self::API.'/calendars/primary/events#'));
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $this->claimed['generation'],
            'answer' => 'I could not confirm the event.'], $this->runnerHeaders())->assertOk()->assertJsonPath('run.state', 'outcome_unknown');
        $this->assertDatabaseHas('agent_run_events', ['run_id' => $run['id'], 'type' => 'run.outcome_unknown']);
    }

    public function test_insufficient_scope_is_a_definite_refusal_not_a_reconnect(): void
    {
        $run = $this->start(['google_calendar_freebusy']);
        $this->route('POST', self::API.'/freeBusy#', Http::response(['error' => ['code' => 403, 'status' => 'PERMISSION_DENIED',
            'message' => 'Request had insufficient authentication scopes.']], 403));
        $this->cal('google_calendar_freebusy', ['calendarIds' => ['primary'], 'timeMin' => '2026-10-02T00:00:00Z',
            'timeMax' => '2026-10-03T00:00:00Z', 'timeZone' => 'UTC'], 'r1')->assertJsonPath('action.result.outcome', 'refused')
            ->assertJsonPath('action.result.reason', 'insufficient_scope');
        $this->assertSame('running', $this->runState($run['id']));
        $this->assertDatabaseHas('agent_connections', ['id' => $this->conn, 'health' => 'healthy']);
    }
}
