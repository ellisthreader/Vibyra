<?php

namespace Tests\Feature;

use App\Services\Agents\ToolPolicy;
use App\Services\ChatConnectors\{Catalogue, Installs, Registry};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class HackerNewsConnectorTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_composio_bridge_is_disabled_without_its_key_and_flag(): void
    {
        config(['chat_connectors.enabled' => true, 'chat_connectors.composio_public_enabled' => true,
            'chat_connectors.composio_api_key' => '']);
        $off = collect(app(Catalogue::class)->payload(42)['integrations'])->firstWhere('id', 'hackernews');
        self::assertFalse($off['installed']);
        config(['chat_connectors.composio_api_key' => 'test-key']);
        $on = collect(app(Catalogue::class)->payload(42)['integrations'])->firstWhere('id', 'hackernews');
        self::assertTrue($on['installed']);
        self::assertContains('hackernews', app(Installs::class)->installed(42));
        self::assertSame('', app(Installs::class)->credential(42, 'hackernews'));
        self::assertFalse(app(ToolPolicy::class)->requiresApproval('hackernews', 'hackernews_user'));
    }

    public function test_no_argument_tool_has_a_json_object_schema(): void
    {
        $tool = app(Registry::class)->for('hackernews')->definitions()[0];
        self::assertSame('{}', json_encode($tool['function']['parameters']['properties']));
    }

    public function test_session_and_execution_are_restricted_to_reviewed_public_tools(): void
    {
        config(['chat_connectors.composio_api_key' => 'test-key']);
        Http::fake(function ($request) {
            if ($request->method() === 'DELETE') return Http::response([], 204);
            if (str_ends_with($request->url(), '/execute')) return Http::response([
                'data' => ['username' => 'pg', 'karma' => 100, 'about' => 'Public bio'], 'error' => null]);
            return Http::response(['session_id' => 'trs_verified123'], 201);
        });
        $connector = app(Registry::class)->for('hackernews');
        $safe = $connector->validate('hackernews_user', ['username' => 'pg', 'extra' => 'drop']);
        self::assertSame(['username' => 'pg'], $safe);
        $result = $connector->run('hackernews_user', $safe, '');
        self::assertSame('pg', $result['result']['username']);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_ends_with($request->url(), '/tool_router/session')
            && $request['toolkits'] === ['enable' => ['hackernews']]
            && $request['tools']['hackernews']['enable'] === ['HACKERNEWS_GET_TOP_STORIES',
                'HACKERNEWS_GET_ITEM', 'HACKERNEWS_GET_USER']
            && $request['premium_usage'] === false
            && $request['manage_connections'] === ['enable' => false]
            && $request['workbench'] === ['enable' => false]);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/execute')
            && $request['tool_slug'] === 'HACKERNEWS_GET_USER'
            && str_contains($request->body(), '"arguments":{"username":"pg"}'));
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_ends_with($request->url(), '/trs_verified123'));
    }

    public function test_top_stories_are_capped_and_empty_arguments_are_sent_as_an_object(): void
    {
        config(['chat_connectors.composio_api_key' => 'test-key']);
        Http::fake(function ($request) {
            if ($request->method() === 'DELETE') return Http::response([], 204);
            if (str_ends_with($request->url(), '/execute')) return Http::response([
                'data' => ['count' => 30, 'story_ids' => range(1, 30)], 'error' => null]);
            return Http::response(['session_id' => 'trs_verified123'], 201);
        });
        $result = app(Registry::class)->for('hackernews')->run('hackernews_top_stories', [], '');
        self::assertCount(15, $result['result']['storyIds']);
        self::assertSame(1, $result['result']['storyIds'][0]);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/execute')
            && str_contains($request->body(), '"arguments":{}'));
    }

    public static function operations(): array
    {
        return [
            'hackernews_top_stories' => ['hackernews_top_stories', [], 'HACKERNEWS_GET_TOP_STORIES',
                ['story_ids' => [1, 2, 3]], 'Read Hacker News top-story IDs'],
            'hackernews_item' => ['hackernews_item', ['id' => 42], 'HACKERNEWS_GET_ITEM',
                ['id' => 42, 'title' => 'A public story'], 'Read Hacker News item 42'],
            'hackernews_user' => ['hackernews_user', ['username' => 'pg'], 'HACKERNEWS_GET_USER',
                ['username' => 'pg', 'karma' => 100], 'Read Hacker News user pg'],
        ];
    }

    #[DataProvider('operations')]
    public function test_every_public_hacker_news_operation_uses_its_reviewed_tool(
        string $operation, array $arguments, string $tool, array $answer, string $summary): void
    {
        config(['chat_connectors.composio_api_key' => 'test-key']);
        Http::fake(function ($request) use ($answer) {
            if ($request->method() === 'DELETE') return Http::response([], 204);
            if (str_ends_with($request->url(), '/execute')) return Http::response([
                'data' => $answer, 'error' => null]);
            return Http::response(['session_id' => 'trs_verified123'], 201);
        });
        $connector = app(Registry::class)->for('hackernews');
        $safe = $connector->validate($operation, $arguments);
        $result = $connector->run($operation, $safe, '');
        self::assertIsArray($result['result']);
        self::assertStringContainsString($summary, $result['summary']);
        Http::assertSent(fn ($request) => str_ends_with($request->url(), '/execute')
            && $request['tool_slug'] === $tool
            && str_contains($request->body(), '"arguments":'.json_encode($safe ?: new \stdClass)));
    }
}
