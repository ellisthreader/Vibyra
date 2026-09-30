<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** OneDrive, SharePoint and Teams through the V2 broker, plus Microsoft catalogue readiness (fixtures only). */
class AgentV2Microsoft365ToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const TEAM = '11111111-2222-3333-4444-555555555555';
    private const CHANNEL = '19:abcdef123456@thread.tacv2';
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
        $this->admit('Look through my Microsoft files.');
        $this->claimed = $this->claim();
        return $conn;
    }

    private function graphCall(string $conn, string $tool, array $args, string $callId)
    {
        return $this->callTool($this->claimed, $tool, $conn, $args, $callId)->assertOk();
    }

    public function test_onedrive_reads_text_through_the_signed_url_without_the_bearer(): void
    {
        $conn = $this->start('onedrive', ['onedrive_search', 'onedrive_read']);
        $this->route('GET', '#/me/drive/root/search#', Http::response(['value' => [['id' => '01ABC', 'name' => 'notes.md',
            'size' => 10, 'file' => ['mimeType' => 'text/markdown']]]]));
        $this->graphCall($conn, 'onedrive_search', ['query' => "q3 'plan'"], 'r1')->assertJsonPath('action.result.files.0.name', 'notes.md');
        $this->route('GET', '#/me/drive/items/01ABC#', Http::response(['id' => '01ABC', 'name' => 'notes.md', 'size' => 10,
            'file' => ['mimeType' => 'text/markdown'], '@microsoft.graph.downloadUrl' => 'https://contoso-my.sharepoint.com/dl/abc?tempauth=x']));
        $this->route('GET', '#contoso-my\.sharepoint\.com/dl/abc#', Http::response('Ship it.'));
        $this->graphCall($conn, 'onedrive_read', ['id' => '01ABC'], 'r2')->assertJsonPath('action.result.text', 'Ship it.');
        Http::assertSent(fn ($r) => str_contains($r->url(), 'sharepoint.com/dl/abc') && !$r->hasHeader('Authorization'));
        // A download URL on any other host is refused; the file is never fetched and the token never leaves Graph.
        $this->route('GET', '#/me/drive/items/01EVIL#', Http::response(['id' => '01EVIL', 'name' => 'x.txt', 'size' => 5,
            'file' => ['mimeType' => 'text/plain'], '@microsoft.graph.downloadUrl' => 'https://evil.example.com/steal']));
        $this->graphCall($conn, 'onedrive_read', ['id' => '01EVIL'], 'r3')->assertJsonPath('action.result.outcome', 'refused')
            ->assertJsonPath('action.result.reason', 'unsupported');
        $this->assertSame(0, $this->sent('GET', '#evil\.example\.com#'));
    }

    public function test_sharepoint_searches_sites_and_reads_documents(): void
    {
        $conn = $this->start('sharepoint', ['sharepoint_search_sites', 'sharepoint_search_files', 'sharepoint_read']);
        $site = 'contoso.sharepoint.com,1234abcd,5678efgh';
        $this->route('GET', '#/v1\.0/sites\?search=#', Http::response(['value' => [['id' => $site, 'displayName' => 'Finance']]]));
        $this->graphCall($conn, 'sharepoint_search_sites', ['query' => 'finance'], 'r1')->assertJsonPath('action.result.sites.0.id', $site);
        $this->route('GET', '#/sites/.+/drive/items/01DOC#', Http::response(['id' => '01DOC', 'name' => 'budget.csv', 'size' => 9,
            'file' => ['mimeType' => 'text/csv'], '@microsoft.graph.downloadUrl' => 'https://contoso.sharepoint.com/dl/b']));
        $this->route('GET', '#contoso\.sharepoint\.com/dl/b#', Http::response("a,b\n1,2\n"));
        $this->graphCall($conn, 'sharepoint_read', ['siteId' => $site, 'itemId' => '01DOC'], 'r2')->assertJsonPath('action.result.text', "a,b\n1,2\n");
        $this->graphCall($conn, 'sharepoint_read', ['siteId' => '../me', 'itemId' => '01DOC'], 'r3')->assertJsonPath('action.result.reason', 'invalid_arguments');
    }

    public function test_teams_reads_and_refuses_a_personal_account(): void
    {
        $conn = $this->start('teams', ['teams_list_teams', 'teams_list_channels', 'teams_read_channel']);
        $this->route('GET', '#/me/joinedTeams#', Http::response(['value' => [['id' => self::TEAM, 'displayName' => 'Ops']]]));
        $this->graphCall($conn, 'teams_list_teams', [], 'r1')->assertJsonPath('action.result.teams.0.name', 'Ops');
        $this->route('GET', '#/channels/19:abcdef123456@thread\.tacv2/messages#', Http::response(['value' => [['id' => '1700000000001',
            'from' => ['user' => ['displayName' => 'Ann']], 'body' => ['contentType' => 'html', 'content' => '<p>Deploy &amp; relax</p>']]]]));
        $this->graphCall($conn, 'teams_read_channel', ['teamId' => self::TEAM, 'channelId' => self::CHANNEL], 'r2')
            ->assertJsonPath('action.result.messages.0.text', 'Deploy & relax');
        $this->graphCall($conn, 'teams_read_channel', ['teamId' => self::TEAM, 'channelId' => 'general'], 'r3')
            ->assertJsonPath('action.result.reason', 'invalid_arguments');
        $this->route('GET', '#/me/joinedTeams#', Http::response(['error' => ['code' => 'BadRequest',
            'message' => 'Requested API is not supported for MSA accounts.']], 400));
        $this->graphCall($conn, 'teams_list_teams', [], 'r4')->assertJsonPath('action.result.outcome', 'refused')
            ->assertJsonPath('action.result.reason', 'personal_account_unsupported');
        $this->route('GET', '#/me/joinedTeams#', Http::response(['error' => ['code' => 'Forbidden',
            'message' => 'Insufficient privileges to complete the operation.']], 403));
        $this->graphCall($conn, 'teams_list_teams', [], 'r5')->assertJsonPath('action.result.reason', 'insufficient_scope');
    }

    public function test_teams_post_is_gated_and_an_unconfirmed_post_is_found_once_or_stays_unknown(): void
    {
        $conn = $this->start('teams', ['teams_post_message']);
        $args = ['teamId' => self::TEAM, 'channelId' => self::CHANNEL, 'text' => 'Deploy is done.'];
        $this->route('POST', '#/messages$#', Http::response(['id' => '1700000000002', 'webUrl' => 'https://teams.microsoft.com/l/message/x'], 201));
        $ok = $this->graphCall($conn, 'teams_post_message', $args, 'w1')->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->assertSame(0, $this->sent('POST', '#/messages#'));
        $this->decide($ok)->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.receipt.providerResourceId', self::CHANNEL.':1700000000002');

        $this->route('POST', '#/messages$#', $this->timeout());
        $this->route('GET', '#/v1\.0/me\?#', Http::response(['id' => 'user-me']));
        $mine = fn (string $id) => ['id' => $id, 'from' => ['user' => ['id' => 'user-me']], 'createdDateTime' => now()->toIso8601String(),
            'body' => ['contentType' => 'html', 'content' => '<p>Deploy is done.</p>']];
        $this->route('GET', '#/messages\?#', Http::response(['value' => [$mine('1700000000003')]]));
        $found = $this->graphCall($conn, 'teams_post_message', $args, 'w2')->json('action');
        $this->decide($found)->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.reconciled', true);
        // Two identical recent posts cannot prove which one is ours: it stays unknown.
        $this->route('GET', '#/messages\?#', Http::response(['value' => [$mine('1700000000004'), $mine('1700000000005')]]));
        $lost = $this->graphCall($conn, 'teams_post_message', $args, 'w3')->json('action');
        $this->decide($lost)->assertJsonPath('action.state', 'unknown')->assertJsonPath('action.result.outcome', 'outcome_unknown');
        $this->assertSame(3, $this->sent('POST', '#/messages$#'), 'An unknown post is never re-sent.');
    }

    public function test_catalogue_lists_microsoft_as_unavailable_until_its_client_is_configured(): void
    {
        config(['chat_connectors.catalogue.teams.oauth.client_id' => null, 'chat_connectors.catalogue.teams.oauth.client_secret' => null]);
        $teams = collect($this->getJson('/api/agents/v2/catalogue')->assertOk()->json('providers'))->keyBy('provider')['teams'];
        $this->assertSame(['unavailable', 'credentials_missing'], [$teams['readiness'], $teams['reason']]);
        $this->assertContains(['tool' => 'teams_post_message', 'kind' => 'write'], $teams['tools']);
        config(['chat_connectors.catalogue.teams.oauth.client_id' => 'mid', 'chat_connectors.catalogue.teams.oauth.client_secret' => 'ms']);
        $teams = collect($this->getJson('/api/agents/v2/catalogue')->json('providers'))->keyBy('provider')['teams'];
        $this->assertSame('ready', $teams['readiness']);
    }
}
