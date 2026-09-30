<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Browser\BrowserOrigins;
use App\Services\Mcp\EndpointPolicy;
use InvalidArgumentException;
use Tests\TestCase;

/** F-23 (security review 2026-09-30): IPv6 forms that embed or alias an IPv4 or special-purpose address are never "public". */
class AgentV2McpEndpointIpv6Test extends TestCase
{
    private const NOT_PUBLIC = ['2002:7f00:1::1', '2002:c0a8:101::1', '2002:0a00:1::', '2002:a9fe:a9fe::1', '3fff::1', '3fff:0fff:ffff::1',
        '64:ff9b::7f00:1', '64:ff9b::a00:1', '64:ff9b:1::1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::7f00:1', '::1', '::', 'fec0::1', 'fe80::1', 'fc00::1', 'fd12::1',
        '2001::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:db8::1', '2001:10::1', 'ff02::1', '100::1',
        '127.0.0.1', '10.1.2.3', '100.64.0.1', '169.254.169.254', '192.168.1.1', '0.0.0.0'];
    private const PUBLIC = ['2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '93.184.216.34', '1.1.1.1'];

    public function test_the_mcp_endpoint_policy_refuses_every_non_public_ip_class(): void
    {
        foreach (self::NOT_PUBLIC as $ip) {
            $policy = new EndpointPolicy(fn () => [$ip]);
            try { $policy->pin('https://mcp.example.com/mcp'); $this->fail('Accepted '.$ip); }
            catch (InvalidArgumentException) { $this->assertTrue(true); }
        }
        foreach (self::PUBLIC as $ip) $this->assertSame($ip, (new EndpointPolicy(fn () => [$ip]))->pin('https://mcp.example.com/mcp')['address']);
        $mixed = new EndpointPolicy(fn () => ['93.184.216.34', '2002:7f00:1::1']);
        $this->expectException(InvalidArgumentException::class);
        $mixed->pin('https://mcp.example.com/mcp');
    }

    public function test_browser_grants_refuse_the_same_literal_addresses(): void
    {
        foreach (self::NOT_PUBLIC as $ip) {
            $host = str_contains($ip, ':') ? '['.$ip.']' : $ip;
            $this->assertNull(BrowserOrigins::normalize('https://'.$host), $ip);
            $this->assertNull(BrowserOrigins::ofUrl('https://'.$host.'/x'), $ip);
        }
        $this->assertSame('https://[2606:4700:4700::1111]', BrowserOrigins::normalize('https://[2606:4700:4700::1111]'));
        $this->assertSame('https://shop.example.com', BrowserOrigins::normalize('shop.example.com'));
    }
}
