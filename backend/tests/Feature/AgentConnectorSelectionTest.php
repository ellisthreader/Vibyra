<?php

namespace Tests\Feature;

use App\Services\Agents\ConnectorSelection;
use Tests\TestCase;

class AgentConnectorSelectionTest extends TestCase
{
    public function test_a_late_grant_can_be_selected_by_name(): void
    {
        $grants = ['github', 'stripe', 'figma', 'gmail', 'google_calendar', 'google_drive',
            'outlook_mail', 'outlook_calendar', 'onedrive', 'slack', 'notion', 'linear'];
        $this->assertSame(['linear'], ConnectorSelection::forTask('Review @linear issues', $grants, 10));
        $this->assertSame(['notion'], ConnectorSelection::forTask('Find my Notion page', $grants, 10));
    }

    public function test_generic_task_words_choose_relevant_grants_within_the_quote_budget(): void
    {
        $grants = ['github', 'stripe', 'figma', 'gmail', 'google_calendar', 'google_drive',
            'outlook_mail', 'outlook_calendar', 'onedrive', 'slack', 'notion', 'linear'];
        $this->assertSame(['gmail', 'outlook_mail'], ConnectorSelection::forTask('Review my emails', $grants, 10));
        $this->assertSame(['google_calendar', 'outlook_calendar'],
            ConnectorSelection::forTask('Check upcoming meetings', $grants, 10));
        $this->assertCount(10, ConnectorSelection::forTask('Help me plan today', $grants, 10));
    }
}
