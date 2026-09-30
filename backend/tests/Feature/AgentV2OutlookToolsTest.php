<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Tools\Providers\{GraphApi, OutlookMailTools};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Outlook Mail + Calendar through the V2 broker: paging, typed Graph outcomes, gated writes, reconciliation (fixtures only). */
class AgentV2OutlookToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function start(string $provider, array $ops): string
    {
        $conn = $this->providerInstall($provider, 'me@contoso.com', 'graph-token');
        $this->grant($conn, $ops);
        $this->admit('Check my Outlook.');
        $this->claimed = $this->claim();
        return $conn;
    }

    private function graphCall(string $conn, string $tool, array $args, string $callId)
    {
        return $this->callTool($this->claimed, $tool, $conn, $args, $callId)->assertOk();
    }

    public function test_mail_search_pages_with_an_opaque_token_and_reads_bounded_text(): void
    {
        $conn = $this->start('outlook_mail', ['outlook_mail_search', 'outlook_mail_read']);
        $this->route('GET', '#graph\.microsoft\.com/v1\.0/me/messages\?#', Http::response(['value' => [['id' => 'AAMkAGI1', 'subject' => 'Invoice',
            'from' => ['emailAddress' => ['address' => 'ap@fabrikam.com']], 'bodyPreview' => 'Due Friday']],
            '@odata.nextLink' => 'https://graph.microsoft.com/v1.0/me/messages?$search=%22invoice%22&$top=10&$skip=10']));
        $first = $this->graphCall($conn, 'outlook_mail_search', ['query' => 'invoice'], 'r1')
            ->assertJsonPath('action.result.messages.0.from', 'ap@fabrikam.com')->assertJsonPath('action.result.hasMore', true);
        $token = $first->json('action.result.nextPageToken');
        $this->assertSame(['$skip' => '10'], GraphApi::restore($token));
        $this->graphCall($conn, 'outlook_mail_search', ['query' => 'invoice', 'pageToken' => $token], 'r2')->assertJsonPath('action.state', 'completed');
        Http::assertSent(fn ($r) => str_contains(urldecode($r->url()), '$skip=10') && $r->hasHeader('Authorization', 'Bearer graph-token'));
        // A forged token naming another URL or parameter is refused before Microsoft is asked.
        $forged = rtrim(strtr(base64_encode(json_encode(['$filter' => 'x'])), '+/', '-_'), '=');
        $this->graphCall($conn, 'outlook_mail_search', ['query' => 'invoice', 'pageToken' => $forged], 'r3')
            ->assertJsonPath('action.result.reason', 'invalid_arguments');
        $this->route('GET', '#/me/messages/AAMkAGI1abc#', Http::response(['id' => 'AAMkAGI1abc', 'subject' => 'Invoice',
            'body' => ['contentType' => 'text', 'content' => str_repeat('a', 12005)]]));
        $this->graphCall($conn, 'outlook_mail_read', ['id' => 'AAMkAGI1abc'], 'r4')->assertJsonPath('action.result.truncated', true)
            ->assertJsonPath('action.result.nextStartChar', 12000);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'AAMkAGI1abc') && $r->hasHeader('Prefer', 'outlook.body-content-type="text"'));
    }

    public function test_graph_outcomes_are_typed(): void
    {
        $conn = $this->start('outlook_mail', ['outlook_mail_search']);
        $this->route('GET', '#/me/messages#', Http::response(['error' => ['code' => 'TooManyRequests']], 429, ['Retry-After' => '30']));
        $this->graphCall($conn, 'outlook_mail_search', ['query' => 'a'], 'r1')->assertJsonPath('action.result.outcome', 'rate_limited')
            ->assertJsonPath('action.result.retryAfter', 30);
        $this->route('GET', '#/me/messages#', $this->timeout());
        $this->graphCall($conn, 'outlook_mail_search', ['query' => 'a'], 'r2')->assertJsonPath('action.result.outcome', 'retryable');
        $this->route('GET', '#/me/messages#', Http::response(['error' => ['code' => 'InvalidAuthenticationToken']], 401));
        $this->graphCall($conn, 'outlook_mail_search', ['query' => 'a'], 'r3')->assertJsonPath('action.result.outcome', 'reconnect_required');
    }

    public function test_send_is_gated_carries_the_action_marker_and_reconciles_by_it(): void
    {
        $conn = $this->start('outlook_mail', ['outlook_mail_send']);
        $this->route('POST', '#/me/sendMail#', Http::response('', 202));
        $action = $this->graphCall($conn, 'outlook_mail_send', ['to' => 'ap@fabrikam.com', 'subject' => 'Paid', 'body' => 'Done.'], 'w1')
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->assertSame(0, $this->sent('POST', '#sendMail#'));
        $this->decide($action)->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.accepted', true);
        $marker = OutlookMailTools::marker($action['id']);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'sendMail') && $r['message']['toRecipients'][0]['emailAddress']['address'] === 'ap@fabrikam.com'
            && $r['message']['singleValueExtendedProperties'][0]['value'] === $marker && $r['message']['internetMessageHeaders'][0]['value'] === $marker);

        // A timed-out send is found in Sent Items by its marker, never re-sent.
        $this->route('POST', '#/me/sendMail#', $this->timeout());
        $lost = $this->graphCall($conn, 'outlook_mail_send', ['to' => 'ap@fabrikam.com', 'subject' => 'Again', 'body' => 'x'], 'w2')->json('action');
        $this->route('GET', '#/mailFolders/sentitems/messages#', fn ($r) => Http::response(['value' => str_contains(urldecode($r->url()),
            OutlookMailTools::marker($lost['id'])) ? [['id' => 'sent-9', 'subject' => 'Again',
                'toRecipients' => [['emailAddress' => ['address' => 'AP@fabrikam.com']]]]] : []]));
        $this->decide($lost)->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.reconciled', true)
            ->assertJsonPath('action.receipt.providerResourceId', 'sent-9');
        $gone = $this->graphCall($conn, 'outlook_mail_send', ['to' => 'ap@fabrikam.com', 'subject' => 'Third', 'body' => 'x'], 'w3')->json('action');
        $this->decide($gone)->assertJsonPath('action.state', 'unknown')->assertJsonPath('action.result.outcome', 'outcome_unknown');
        $this->assertSame(3, $this->sent('POST', '#sendMail#'), 'An unknown send is never re-sent.');
    }

    public function test_calendar_reads_are_explicit_and_create_dedupes_by_transaction_id(): void
    {
        $conn = $this->start('outlook_calendar', ['outlook_calendar_list_events', 'outlook_calendar_freebusy', 'outlook_calendar_create_event']);
        $window = ['timeMin' => '2026-10-01T00:00:00+01:00', 'timeMax' => '2026-10-02T00:00:00+01:00', 'timeZone' => 'Europe/London'];
        $this->route('GET', '#/me/calendar/calendarView#', Http::response(['value' => [['id' => 'ev1', 'subject' => 'Standup',
            'start' => ['dateTime' => '2026-10-01T09:00:00'], 'end' => ['dateTime' => '2026-10-01T09:15:00'], 'showAs' => 'busy']]]));
        $this->graphCall($conn, 'outlook_calendar_list_events', ['calendarId' => 'primary'] + $window, 'r1')
            ->assertJsonPath('action.result.events.0.title', 'Standup')->assertJsonPath('action.result.hasMore', false);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'calendarView') && $r->hasHeader('Prefer', 'outlook.timezone="Europe/London"'));
        $this->graphCall($conn, 'outlook_calendar_list_events', ['calendarId' => 'Work'] + $window, 'r2')->assertJsonPath('action.result.reason', 'invalid_arguments');
        $this->route('POST', '#/me/calendar/getSchedule#', Http::response(['value' => [['scheduleId' => 'Boss@contoso.com',
            'scheduleItems' => [['status' => 'busy', 'start' => ['dateTime' => '2026-10-01T10:00:00.0000000', 'timeZone' => 'UTC'],
                'end' => ['dateTime' => '2026-10-01T11:00:00.0000000', 'timeZone' => 'UTC']], ['status' => 'free']]]]]));
        $this->graphCall($conn, 'outlook_calendar_freebusy', ['schedules' => ['boss@contoso.com']] + $window, 'r3')
            ->assertJsonPath('action.result.schedules.0.busy.0.start', '2026-10-01T11:00:00+01:00')
            ->assertJsonCount(1, 'action.result.schedules.0.busy');

        $event = ['calendarId' => 'primary', 'title' => 'Review', 'start' => '2026-10-01T14:00:00+01:00',
            'end' => '2026-10-01T14:30:00+01:00', 'timeZone' => 'Europe/London'];
        $this->route('POST', '#/me/calendar/events#', $this->timeout());
        $action = $this->graphCall($conn, 'outlook_calendar_create_event', $event, 'w1')->assertJsonPath('action.state', 'pending_approval')->json('action');
        $tx = 'vibyra-'.$action['id'];
        $this->route('GET', '#/me/calendar/calendarView#', Http::response(['value' => [
            ['id' => 'other', 'subject' => 'Review', 'transactionId' => null, 'start' => ['dateTime' => '2026-10-01T13:00:00.0000000', 'timeZone' => 'UTC'],
                'end' => ['dateTime' => '2026-10-01T13:30:00.0000000', 'timeZone' => 'UTC']],
            ['id' => 'ev-mine', 'subject' => 'Review', 'transactionId' => $tx, 'attendees' => [],
                'start' => ['dateTime' => '2026-10-01T13:00:00.0000000', 'timeZone' => 'UTC'],
                'end' => ['dateTime' => '2026-10-01T13:30:00.0000000', 'timeZone' => 'UTC']]]]));
        $this->decide($action)->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.reconciled', true)
            ->assertJsonPath('action.receipt.providerResourceId', 'ev-mine');
        Http::assertSent(fn ($r) => $r->method() === 'POST' && str_contains($r->url(), '/events') && $r['transactionId'] === $tx
            && $r['attendees'] === [] && $r['start'] === ['dateTime' => '2026-10-01T13:00:00', 'timeZone' => 'UTC']);
        $this->assertSame(1, $this->sent('POST', '#/me/calendar/events#'), 'Reconciliation never re-creates.');
    }
}
