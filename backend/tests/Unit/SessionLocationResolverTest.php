<?php

namespace Tests\Unit;

use App\Services\SessionLocationResolver;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class SessionLocationResolverTest extends TestCase
{
    public function test_missing_database_returns_public_ip_without_caching_it(): void
    {
        config()->set('services.maxmind.database_path', storage_path('app/maxmind/missing-test.mmdb'));
        $resolver = app(SessionLocationResolver::class);

        $this->assertSame('8.8.8.8', $resolver->labelForIp('8.8.8.8'));
        $this->assertFalse(Cache::has('geoip.label.missing.8.8.8.8'));
    }

    public function test_private_ip_is_reported_as_local_network(): void
    {
        $resolver = app(SessionLocationResolver::class);

        $this->assertSame('Local network', $resolver->labelForIp('127.0.0.1'));
        $this->assertSame('Local network', $resolver->labelForIp('192.168.1.10'));
    }

    public function test_update_command_explains_when_the_license_key_is_missing(): void
    {
        config()->set('services.maxmind.account_id', '123456');
        config()->set('services.maxmind.license_key', '');

        $this->artisan('maxmind:update')
            ->expectsOutput('MAXMIND_LICENSE_KEY is not configured. Device locations will use public IP addresses.')
            ->assertFailed();
    }

    public function test_update_command_explains_when_the_account_id_is_missing(): void
    {
        config()->set('services.maxmind.account_id', '');
        config()->set('services.maxmind.license_key', 'configured');

        $this->artisan('maxmind:update')
            ->expectsOutput('MAXMIND_ACCOUNT_ID is not configured. Device locations will use public IP addresses.')
            ->assertFailed();
    }
}
