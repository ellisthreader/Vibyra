<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

class AgentV2GmailReceiptTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    public function test_empty_provider_ids_never_confirm_an_approved_send_or_allow_a_retry(): void
    {
        $this->bootV2();
        $conn = $this->providerInstall('gmail', 'sender@example.com', 'sender-token');
        $this->grant($conn, ['gmail_send']);
        $this->admit('Send the approved message.');
        $claim = $this->claim();
        $this->route('POST', '#gmail\.googleapis\.com/gmail/v1/users/me/messages/send#', Http::response(['id' => '']));
        $this->route('GET', '#gmail\.googleapis\.com/gmail/v1/users/me/messages\?#', Http::response(['messages' => [['id' => '']]]));
        $args = ['to' => 'recipient@example.com', 'subject' => 'Hello', 'body' => 'Exact body'];
        $action = $this->callTool($claim, 'gmail_send', $conn, $args, 'send-1')->assertOk()->json('action');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'unknown')
            ->assertJsonPath('action.receipt.status', 'unknown');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->callTool($claim, 'gmail_send', $conn, $args, 'send-2')->assertOk()
            ->assertJsonPath('action.result.reason', 'outcome_unknown');
        $this->assertSame(1, $this->sent('POST', '#/messages/send#'));
    }
}
