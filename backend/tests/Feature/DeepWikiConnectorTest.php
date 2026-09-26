<?php

namespace Tests\Feature;

use App\Services\Agents\ToolPolicy;
use App\Services\ChatConnectors\{Catalogue, ConnectorTools, Installs, Registry};
use App\Services\Mcp\Gateway;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class DeepWikiConnectorTest extends TestCase
{
    use RefreshDatabase;

    public static function operations(): array
    {
        return [
            'deepwiki_structure' => ['deepwiki_structure', 'read_wiki_structure', ['repoName' => 'modelcontextprotocol/php-sdk']],
            'deepwiki_contents' => ['deepwiki_contents', 'read_wiki_contents', ['repoName' => 'modelcontextprotocol/php-sdk']],
            'deepwiki_ask' => ['deepwiki_ask', 'ask_wiki_question', ['repoName' => 'modelcontextprotocol/php-sdk',
                'question' => 'What is the client API?']],
        ];
    }

    #[DataProvider('operations')]
    public function test_each_public_mcp_read_is_validated_and_routed(
        string $operation, string $remote, array $arguments): void
    {
        $gateway = Mockery::mock(Gateway::class);
        $gateway->shouldReceive('call')->once()->with('https://mcp.deepwiki.com/mcp', $remote, $arguments)
            ->andReturn(['text' => 'Public documentation', 'truncated' => false]);
        $this->app->instance(Gateway::class, $gateway);
        $connector = app(Registry::class)->for('deepwiki');
        $safe = $connector->validate($operation, $arguments);
        $result = $connector->run($operation, $safe, '');
        self::assertSame('Public documentation', $result['result']['text']);
        self::assertSame('modelcontextprotocol/php-sdk', $result['result']['repoName']);
        self::assertFalse(app(ToolPolicy::class)->requiresApproval('deepwiki', $operation));
    }

    public function test_public_service_is_ready_without_an_account_only_when_enabled(): void
    {
        config(['chat_connectors.enabled' => true, 'chat_connectors.public_mcp_enabled' => false]);
        $off = collect(app(Catalogue::class)->payload(null)['integrations'])->firstWhere('id', 'deepwiki');
        self::assertSame('public', $off['credential']['kind']);
        self::assertFalse($off['credential']['configured']);
        self::assertFalse($off['installed']);
        config(['chat_connectors.public_mcp_enabled' => true]);
        $on = collect(app(Catalogue::class)->payload(42)['integrations'])->firstWhere('id', 'deepwiki');
        self::assertTrue($on['credential']['configured']);
        self::assertTrue($on['installed']);
        self::assertContains('deepwiki', app(Installs::class)->installed(42));
        self::assertContains('deepwiki', app(ConnectorTools::class)->resolve(42, ['deepwiki']));
        self::assertSame('', app(Installs::class)->credential(42, 'deepwiki'));
    }

    public function test_a_public_service_cannot_accept_a_key_or_be_disconnected(): void
    {
        config(['chat_connectors.enabled' => true, 'chat_connectors.public_mcp_enabled' => true]);
        $installs = app(Installs::class);
        try {
            $installs->connect(42, 'deepwiki', 'secret');
            self::fail('A public MCP service must not save a credential.');
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            self::assertSame(422, $e->getStatusCode());
        }
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $installs->disconnect(42, 'deepwiki');
    }
}
