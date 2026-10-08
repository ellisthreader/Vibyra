<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\CalendarWrites;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Exact Calendar write confirmation and dispatch authority; never live events. */
class AgentV2CalendarWriteSafetyTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const API = '#www\.googleapis\.com/calendar/v3';
    private const EVENT = ['calendarId' => 'team@example.com', 'title' => 'Launch review',
        'start' => '2026-10-25T01:30:00+01:00', 'end' => '2026-10-25T01:30:00Z',
        'timeZone' => 'Europe/London', 'description' => 'Review the approved launch checklist.'];
    private string $connection;
    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->connection = $this->providerInstall('google_calendar', 'owner@example.com', 'cal-token');
        $this->grant($this->connection, ['google_calendar_create_event']);
        $this->admit('Create the launch review.');
        $this->claimed = $this->claim();
    }

    private function action(): array
    {
        return $this->callTool($this->claimed, 'google_calendar_create_event', $this->connection, self::EVENT, 'w1')
            ->assertOk()->assertJsonPath('action.state', 'pending_approval')->json('action');
    }

    private function event(string $id): array
    {
        return ['id' => $id, 'summary' => self::EVENT['title'], 'description' => self::EVENT['description'],
            'start' => ['dateTime' => self::EVENT['start']], 'end' => ['dateTime' => self::EVENT['end']]];
    }

    public function test_reconciliation_requires_the_description_and_never_confirms_hidden_guests_or_recurrence(): void
    {
        $action = $this->action();
        $id = CalendarWrites::eventId($action['id']);
        $writes = app(CalendarWrites::class);
        foreach ([['description' => 'A different agenda'], ['attendeesOmitted' => true],
            ['attendees' => [['email' => 'unexpected@example.com']]], ['recurrence' => ['RRULE:FREQ=DAILY']],
            ['status' => 'cancelled']] as $change) {
            $this->route('GET', self::API.'/calendars/team@example.com/events/'.$id.'#', Http::response(array_replace($this->event($id), $change)));
            $this->assertNull($writes->reconcile(self::EVENT, 'cal-token', $action['id']));
        }
        $this->route('GET', self::API.'/calendars/team@example.com/events/'.$id.'#', Http::response($this->event($id)));
        $this->assertSame($id, $writes->reconcile(self::EVENT, 'cal-token', $action['id'])['resourceId']);
        $this->assertSame(0, $this->sent('POST', self::API.'#'));
    }

    public function test_a_success_response_with_a_different_description_is_unknown_and_never_reissued(): void
    {
        $action = $this->action();
        $id = CalendarWrites::eventId($action['id']);
        $wrong = array_replace($this->event($id), ['description' => 'Unexpected content']);
        $this->route('POST', self::API.'/calendars/team@example.com/events#', Http::response($wrong));
        $this->route('GET', self::API.'/calendars/team@example.com/events/'.$id.'#', Http::response($wrong));
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'unknown')->assertJsonPath('action.receipt.outcome', 'outcome_unknown');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->assertSame(1, $this->sent('POST', self::API.'#'));
        $this->assertSame(1, $this->sent('GET', self::API.'#'));
    }

    public function test_revoking_the_calendar_connection_before_approval_prevents_dispatch(): void
    {
        $action = $this->action();
        $this->deleteJson('/api/agents/v2/connections/'.$this->connection)->assertOk();
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'refused');
        Http::assertNothingSent();
    }

    public function test_an_approved_calendar_payload_cannot_be_changed_before_dispatch(): void
    {
        $action = $this->action();
        DB::table('agent_tool_actions')->where('id', $action['id'])->update([
            'arguments' => json_encode(array_replace(self::EVENT, ['calendarId' => 'other@example.com']))]);
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'refused');
        Http::assertNothingSent();
    }

    public function test_reconnecting_as_another_account_never_retargets_a_prepared_event(): void
    {
        $action = $this->action();
        $this->providerInstall('google_calendar', 'someone-else@example.com', 'other-token');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'refused');
        Http::assertNothingSent();
    }

    public function test_revoked_provider_token_requires_signin_without_retrying_the_event(): void
    {
        $action = $this->action();
        $this->route('POST', self::API.'/calendars/team@example.com/events#', Http::response(['error' => 'unauthorized'], 401));
        $this->decide($action)->assertOk()->assertJsonPath('action.receipt.outcome', 'reconnect_required');
        $this->assertSame('waiting_for_signin', $this->runState($this->claimed['id']));
        $this->assertDatabaseHas('agent_connections', ['id' => $this->connection, 'health' => 'reconnect_required']);
        $this->assertSame(1, $this->sent('POST', self::API.'#'));
        $this->assertSame(0, $this->sent('GET', self::API.'#'));
    }
}
