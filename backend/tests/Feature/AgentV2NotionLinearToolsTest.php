<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Notion and Linear through the V2 broker: exact targets, cursors, approved writes, typed outcomes (fixtures). */
class AgentV2NotionLinearToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const PAGE = '0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b';
    private const TEAM = '11111111-2222-4333-8444-555555555555';
    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function start(string $provider, array $ops): string
    {
        $conn = $this->providerInstall($provider, 'Acme', $provider.'-token');
        $this->grant($conn, $ops);
        $this->admit('Tidy the notes.');
        $this->claimed = $this->claim();
        return $conn;
    }

    public function test_notion_reads_page_and_writes_wait_for_approval(): void
    {
        $conn = $this->start('notion', ['notion_append_text', 'notion_create_page', 'notion_read_page', 'notion_search']);
        $this->route('POST', '#api\.notion\.com/v1/search#', Http::response(['results' => [['object' => 'page', 'id' => self::PAGE,
            'url' => 'https://www.notion.so/Plan', 'properties' => ['Name' => ['type' => 'title', 'title' => [['plain_text' => 'Plan']]]]]],
            'has_more' => true, 'next_cursor' => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']));
        $this->route('GET', '#/v1/pages/'.self::PAGE.'#', Http::response(['id' => self::PAGE, 'url' => 'https://www.notion.so/Plan',
            'properties' => ['title' => ['type' => 'title', 'title' => [['plain_text' => 'Plan']]]]]));
        $this->route('GET', '#/v1/blocks/'.self::PAGE.'/children#', Http::response(['results' => [['id' => 'b1', 'type' => 'paragraph',
            'paragraph' => ['rich_text' => [['plain_text' => 'Ship Friday.']]]]], 'has_more' => false]));
        $this->route('PATCH', '#/v1/blocks/'.self::PAGE.'/children#', Http::response(['results' => [['id' => 'new-1'], ['id' => 'new-2']]]));
        $call = fn ($tool, $args, $id) => $this->callTool($this->claimed, $tool, $conn, $args, $id)->assertOk();
        $call('notion_search', ['query' => 'Plan'], 'r1')->assertJsonPath('action.result.pages.0.title', 'Plan')
            ->assertJsonPath('action.result.nextCursor', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
        $call('notion_read_page', ['pageId' => self::PAGE], 'r2')->assertJsonPath('action.result.blocks.0.text', 'Ship Friday.')
            ->assertJsonPath('action.receipt.url', 'https://www.notion.so/Plan');
        $action = $call('notion_append_text', ['pageId' => self::PAGE, 'text' => "Owner: Sam\n\nDue: Friday"], 'w1')
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->decide($action)->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.blockIds', ['new-1', 'new-2']);
        Http::assertSent(fn ($r) => $r->method() === 'PATCH' && count($r['children']) === 2
            && $r['children'][1]['paragraph']['rich_text'][0]['text']['content'] === 'Due: Friday');
        // A page not shared with the connection is not_found; a create that answers for another parent is unknown.
        $this->route('GET', '#/v1/pages/#', Http::response(['object' => 'error', 'code' => 'object_not_found'], 404));
        $call('notion_read_page', ['pageId' => self::PAGE], 'r3')->assertJsonPath('action.result.reason', 'not_found');
        $this->route('POST', '#/v1/pages$#', Http::response(['object' => 'page', 'id' => 'p2', 'parent' => ['page_id' => 'someone-else']]));
        $create = $call('notion_create_page', ['parentPageId' => self::PAGE, 'title' => 'Retro'], 'w2')->json('action');
        $this->decide($create)->assertJsonPath('action.state', 'unknown');
    }

    public function test_linear_create_uses_the_action_id_and_reconciles_by_it(): void
    {
        $conn = $this->start('linear', ['linear_comment_issue', 'linear_create_issue', 'linear_list_teams', 'linear_read_issue', 'linear_search_issues']);
        $call = fn ($tool, $args, $id) => $this->callTool($this->claimed, $tool, $conn, $args, $id)->assertOk();
        $this->route('POST', '#api\.linear\.app/graphql#', fn ($r) => Http::response(['data' => str_contains($r['query'], 'teams')
            ? ['teams' => ['nodes' => [['id' => self::TEAM, 'key' => 'ENG', 'name' => 'Eng']], 'pageInfo' => ['hasNextPage' => true, 'endCursor' => 'c2']]]
            : ['issue' => ['id' => 'x', 'identifier' => 'ENG-7', 'title' => 'Sync', 'description' => 'Body', 'url' => 'https://linear.app/i/ENG-7',
                'team' => ['id' => self::TEAM, 'key' => 'ENG'], 'comments' => ['nodes' => []]]]]));
        $call('linear_list_teams', [], 'r1')->assertJsonPath('action.result.teams.0.key', 'ENG')->assertJsonPath('action.result.nextCursor', 'c2');
        $call('linear_read_issue', ['id' => 'ENG-7'], 'r2')->assertJsonPath('action.result.identifier', 'ENG-7')
            ->assertJsonPath('action.receipt.providerResourceId', 'ENG-7');
        $call('linear_create_issue', ['teamId' => 'ENG', 'title' => 'x'], 'r3')->assertJsonPath('action.result.reason', 'invalid_arguments');
        // The mutation times out; the lookup by the action id finds the one issue it made.
        $action = $call('linear_create_issue', ['teamId' => self::TEAM, 'title' => 'Calendar sync'], 'w1')->json('action');
        $this->route('POST', '#api\.linear\.app/graphql#', fn ($r) => str_contains($r['query'], 'issueCreate')
            ? (Http::failedConnection('timed out'))($r)
            : Http::response(['data' => ['issue' => ['id' => $action['id'], 'identifier' => 'ENG-8', 'url' => 'https://linear.app/i/ENG-8',
                'team' => ['id' => self::TEAM]]]]));
        $this->decide($action)->assertJsonPath('action.state', 'completed')->assertJsonPath('action.result.reconciled', true)
            ->assertJsonPath('action.receipt.providerResourceId', 'ENG-8');
        Http::assertSent(fn ($r) => str_contains((string) $r['query'], 'issueCreate') && $r['variables']['input']['id'] === $action['id']);
        $this->assertSame(1, collect(Http::recorded())->filter(fn ($p) => str_contains((string) $p[0]['query'], 'issueCreate'))->count());
    }

    public function test_linear_error_codes_are_typed(): void
    {
        $conn = $this->start('linear', ['linear_comment_issue', 'linear_search_issues']);
        $call = fn ($tool, $args, $id) => $this->callTool($this->claimed, $tool, $conn, $args, $id)->assertOk();
        $this->route('POST', '#graphql#', Http::response(['errors' => [['message' => 'Rate limit', 'extensions' => ['code' => 'RATELIMITED']]]], 400));
        $call('linear_search_issues', ['query' => 'sync'], 'r1')->assertJsonPath('action.result.outcome', 'rate_limited');
        $this->route('POST', '#graphql#', Http::response(['errors' => [['message' => 'Invalid scope: comments:create required',
            'extensions' => ['code' => 'FORBIDDEN']]]], 400));
        $comment = $call('linear_comment_issue', ['issueId' => self::TEAM, 'body' => 'Done.'], 'w1')->json('action');
        $this->decide($comment)->assertJsonPath('action.state', 'failed')->assertJsonPath('action.result.reason', 'insufficient_scope');
        $this->route('POST', '#graphql#', Http::response(['errors' => [['message' => 'auth', 'extensions' => ['code' => 'AUTHENTICATION_ERROR']]]], 400));
        $call('linear_search_issues', ['query' => 'sync'], 'r2')->assertJsonPath('action.result.outcome', 'reconnect_required');
    }
}
