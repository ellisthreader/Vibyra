<?php

namespace Tests\Unit;

use App\Services\Mcp\EndpointPolicy;
use App\Services\Mcp\PinnedHttpClient;
use GuzzleHttp\Psr7\Request;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class McpEndpointPolicyTest extends TestCase
{
    public function test_public_https_address_is_pinned_to_the_validated_result(): void
    {
        $policy = new EndpointPolicy(fn (string $host) => $host === 'mcp.example.com'
            ? ['8.8.8.8', '2001:4860:4860::8888'] : []);
        self::assertSame(['host' => 'mcp.example.com', 'address' => '8.8.8.8', 'port' => 443],
            $policy->pin('https://mcp.example.com/mcp'));
    }

    #[DataProvider('unsafeUrls')]
    public function test_unsafe_urls_and_dns_answers_are_rejected(string $url, array $answers): void
    {
        $policy = new EndpointPolicy(fn () => $answers);
        $this->expectException(InvalidArgumentException::class);
        $policy->pin($url);
    }

    public static function unsafeUrls(): array
    {
        return [
            'plain HTTP' => ['http://mcp.example.com/mcp', ['8.8.8.8']],
            'alternate port' => ['https://mcp.example.com:8443/mcp', ['8.8.8.8']],
            'local hostname' => ['https://localhost/mcp', ['127.0.0.1']],
            'embedded user' => ['https://token@mcp.example.com/mcp', ['8.8.8.8']],
            'fragment' => ['https://mcp.example.com/mcp#hidden', ['8.8.8.8']],
            'control byte' => ["https://mcp.example.com/mcp\r\n", ['8.8.8.8']],
            'no DNS' => ['https://mcp.example.com/mcp', []],
            'mixed public/private' => ['https://mcp.example.com/mcp', ['8.8.8.8', '10.0.0.5']],
            'loopback' => ['https://mcp.example.com/mcp', ['127.0.0.1']],
            'link local' => ['https://mcp.example.com/mcp', ['169.254.169.254']],
            'shared carrier range' => ['https://mcp.example.com/mcp', ['100.64.0.1']],
            'documentation IPv4' => ['https://mcp.example.com/mcp', ['203.0.113.2']],
            'mapped IPv6' => ['https://mcp.example.com/mcp', ['::ffff:127.0.0.1']],
            'documentation IPv6' => ['https://mcp.example.com/mcp', ['2001:db8::2']],
            'unique local IPv6' => ['https://mcp.example.com/mcp', ['fd00::2']],
        ];
    }

    public function test_transport_refuses_private_dns_before_sending_a_request(): void
    {
        $client = new PinnedHttpClient(new EndpointPolicy(fn () => ['169.254.169.254']));
        $this->expectException(InvalidArgumentException::class);
        $client->sendRequest(new Request('GET', 'https://mcp.example.com/mcp'));
    }
}
