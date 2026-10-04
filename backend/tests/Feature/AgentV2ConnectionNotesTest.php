<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** A claimed run tells the model why a service it was asked about has no tools, inside the brief installed Macs already render. */
class AgentV2ConnectionNotesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_a_named_service_without_an_account_and_an_expired_grant_reach_the_model_with_their_fix(): void
    {
        config(['chat_connectors.catalogue.google_calendar.oauth.client_id' => 'cal-client',
            'chat_connectors.catalogue.google_calendar.oauth.client_secret' => 'cal-secret']);
        $this->grant($this->gmailInstall('me@example.com'));
        $github =$this->providerInstall('github', 'octocat', 'gh-token');
        $this->grant($github, ['github_list_issues']);
        DB::table('agent_connections')->where('id', $github)->update(['health' => 'reconnect_required']);
        $this->admit('Summarize unread Gmail and add anything urgent to my Google Calendar.');
        $run = $this->claim();
        $brief = $run['profile']['brief'];
        $this->assertStringStartsWith("Summarize mail.\n\nConnection notes for this task:\n", $brief);
        $this->assertStringContainsString('- No Google Calendar account is connected. Fix: Connect Google Calendar in Connections (the teammate\'s Access tab on iPhone).', $brief);
        $this->assertStringContainsString('GitHub (octocat) needs to sign in again. Fix: Reconnect GitHub in Connections', $brief);
        $this->assertStringContainsString('never just say you cannot do it.', $brief);
        $this->assertEqualsCanonicalizing(['not_connected', 'reconnect_required'], array_column($run['connectionGaps'], 'reason'));
        $this->assertSame(['gmail_search', 'gmail_read'], array_column($run['tools']['tools'], 'tool'), 'Notes never add tools.');
    }

    public function test_a_service_this_server_cannot_connect_is_said_plainly(): void
    {
        config(['chat_connectors.catalogue.google_calendar.oauth.client_id' => '']);
        $this->grant($this->gmailInstall('me@example.com'));
        $this->admit('Summarize unread Gmail and add anything urgent to my Google Calendar.');
        $run = $this->claim();
        $this->assertStringContainsString('- Sign-in for Google Calendar is not set up in this environment yet.', $run['profile']['brief']);
        $this->assertSame(['unavailable'], array_column($run['connectionGaps'], 'reason'));
    }

    public function test_a_fully_usable_task_keeps_the_brief_and_adds_only_the_rule(): void
    {
        $this->grant($this->gmailInstall('me@example.com'));
        $this->admit('Summarize unread Gmail.');
        $run = $this->claim();
        $this->assertSame([], $run['connectionGaps']);
        $this->assertStringStartsWith("Summarize mail.\n\nIf the person asks for a service you have no tools for", $run['profile']['brief']);
    }
}
