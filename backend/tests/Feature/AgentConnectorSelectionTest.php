<?php

namespace Tests\Feature;

use App\Services\Agents\ConnectorSelection;
use Tests\TestCase;

class AgentConnectorSelectionTest extends TestCase
{
    public function test_a_late_grant_can_be_selected_by_name(): void
    {
        $grants = ['github', 'stripe', 'figma', 'gmail', 'google_calendar', 'google_drive',
            'outlook_mail', 'outlook_calendar', 'onedrive', 'google_tasks', 'slack', 'notion', 'linear'];
        $this->assertSame(['linear'], ConnectorSelection::forTask('Review @linear issues', $grants, 10));
        $this->assertSame(['notion'], ConnectorSelection::forTask('Find my Notion page', $grants, 10));
        $this->assertSame(['google_tasks'], ConnectorSelection::forTask('Review my Google Tasks', $grants, 10));
    }

    public function test_generic_task_words_choose_relevant_grants_within_the_quote_budget(): void
    {
        $grants = ['github', 'stripe', 'figma', 'gmail', 'google_calendar', 'google_drive',
            'outlook_mail', 'outlook_calendar', 'onedrive', 'google_tasks', 'slack', 'notion', 'linear'];
        $this->assertSame(['gmail', 'outlook_mail'], ConnectorSelection::forTask('Review my emails', $grants, 10));
        $this->assertSame(['google_calendar', 'outlook_calendar'],
            ConnectorSelection::forTask('Check upcoming meetings', $grants, 10));
        $this->assertSame(['google_tasks'], ConnectorSelection::forTask('Check my tasks', $grants, 10));
        $this->assertCount(10, ConnectorSelection::forTask('Help me plan today', $grants, 10));
    }

    public function test_synonyms_reach_the_right_service_without_pulling_unrelated_ones(): void
    {
        $grants = ['gmail', 'google_calendar', 'google_drive', 'google_tasks', 'slack', 'stripe', 'github'];
        $this->assertSame(['gmail'], ConnectorSelection::forTask('Any unread newsletters from that sender?', $grants, 10));
        $this->assertSame(['google_calendar'], ConnectorSelection::forTask('When is my next appointment or free time?', $grants, 10));
        $this->assertSame(['google_drive'], ConnectorSelection::forTask('Open the budget spreadsheet', $grants, 10));
        $this->assertSame(['google_tasks'], ConnectorSelection::forTask('Add a reminder for Friday', $grants, 10));
        $this->assertSame(['gmail'], ConnectorSelection::forTask('Read my e-mail', $grants, 10));
        $this->assertSame(['stripe'], ConnectorSelection::forTask('List overdue invoices', $grants, 10));
    }

    public function test_context_keeps_an_implied_service_below_what_the_message_asks_for(): void
    {
        $grants = ['github', 'slack', 'gmail'];
        $context = 'Triage my inbox. Summarise my unread emails';
        // Slack matches the message and outranks Gmail, which only the conversation implies.
        $this->assertSame(['slack', 'gmail'], ConnectorSelection::forTask('and post it in Slack?', $grants, 10, $context));
        // Under a tight cap the current message wins.
        $this->assertSame(['slack'], ConnectorSelection::forTask('and post it in Slack?', $grants, 1, $context));
        // A bare follow-up is still about mail.
        $this->assertSame(['gmail', 'github', 'slack'], ConnectorSelection::forTask('and the ones from yesterday?', $grants, 10, $context));
        $this->assertSame(['gmail'], ConnectorSelection::forTask('and the ones from yesterday?', $grants, 1, $context));
    }

    public function test_no_clue_anywhere_keeps_the_granted_order(): void
    {
        $this->assertSame(['github', 'slack'], ConnectorSelection::forTask('Help me', ['github', 'slack', 'gmail'], 2, 'Be brief.'));
    }
}
