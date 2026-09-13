<?php

namespace Tests\Feature;

use App\Models\IntegrationAttempt;
use App\Models\IntegrationConnection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Feature\Concerns\IntegrationFixtures;
use Tests\TestCase;

class IntegrationsFlowTest extends TestCase
{
    use IntegrationFixtures, RefreshDatabase;

    public static function services(): array
    {
        return array_map(fn ($s) => [$s], ['gmail', 'google-calendar', 'google-drive', 'outlook', 'microsoft-calendar', 'onedrive', 'stripe', 'shopify', 'github']);
    }

    #[DataProvider('services')]
    public function test_connect_verify_grant_read_and_remove_access(string $service): void
    {
        $id = $this->connect($service);
        $list = $this->rpc(['operation' => 'list'])->assertOk()->assertJsonPath('connections.0.assigned', false);
        $this->assertStringNotContainsString('provider-access-secret', $list->getContent());
        $this->assertStringNotContainsString('provider-refresh-secret', DB::table('integration_connections')->value('credentials'));
        $this->rpc(['operation' => 'read', 'id' => $id])->assertForbidden();
        $this->rpc(['operation' => 'grant', 'id' => $id, 'enabled' => true])->assertOk();
        $read = $this->rpc(['operation' => 'read', 'id' => $id])->assertOk();
        $this->assertStringNotContainsString('must-never-reach-agent', $read->getContent());
        $this->rpc(['operation' => 'read', 'id' => $id, 'agent' => 'agent-b'])->assertForbidden();
        $this->rpc(['operation' => 'read', 'id' => $id, 'device' => 'device-b'])->assertForbidden();
        $this->rpc(['operation' => 'grant', 'id' => $id, 'enabled' => false])->assertOk();
        $this->rpc(['operation' => 'read', 'id' => $id])->assertForbidden();
        $this->rpc(['operation' => 'disconnect', 'id' => $id])->assertOk();
        $this->assertDatabaseMissing('integration_connections', ['id' => $id]);
    }

    public function test_missing_registration_does_not_open_fake_signin(): void
    {
        config(['integrations.google.client_id' => null]);
        $list = $this->rpc(['operation' => 'list'])->assertOk();
        $this->assertFalse($list->json('providers.0.ready'));
        $this->rpc(['operation' => 'start', 'service' => 'gmail'])->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_cancel_expiry_and_replay_do_not_connect(): void
    {
        $this->fakeProvider('gmail');
        [$id, $q] = $this->start('gmail');
        $this->rpc(['operation' => 'cancel', 'id' => $id])->assertJsonPath('status', 'cancelled');
        $this->complete('gmail', $q);
        $this->assertDatabaseCount('integration_connections', 0);
        [$id, $q] = $this->start('gmail');
        IntegrationAttempt::query()->find($id)->update(['expires_at' => now()->subMinute()]);
        $this->complete('gmail', $q);
        Http::assertNothingSent();
        [$id, $q] = $this->start('gmail');
        $this->complete('gmail', $q);
        $count = count(Http::recorded());
        $this->complete('gmail', $q);
        $this->assertCount($count, Http::recorded());
        $this->assertDatabaseCount('integration_connections', 1);
    }

    public function test_declined_scope_and_unusable_api_never_become_connected(): void
    {
        $this->fakeProvider('gmail', fn ($r) => str_contains($r->url(), 'token')
            ? Http::response(['access_token' => 'secret', 'scope' => 'openid email']) : null);
        [$id, $q] = $this->start('gmail');
        $this->complete('gmail', $q);
        $this->rpc(['operation' => 'poll', 'id' => $id])->assertJsonPath('status', 'failed');
        $this->assertDatabaseCount('integration_connections', 0);
    }

    public function test_refresh_rotation_survives_later_provider_outage(): void
    {
        $id = $this->connect('google-drive');
        IntegrationConnection::query()->find($id)->update(['expires_at' => now()->subMinute()]);
        $this->fakeProvider('google-drive', function ($r) {
            if (str_contains($r->url(), 'token')) {
                return Http::response(['access_token' => 'new-access', 'refresh_token' => 'rotated-refresh',
                    'scope' => 'https://www.googleapis.com/auth/drive.metadata.readonly', 'expires_in' => 3600]);
            }

            return Http::response([], 503);
        });
        $this->rpc(['operation' => 'check', 'id' => $id])->assertStatus(503);
        $this->assertSame('rotated-refresh', IntegrationConnection::query()->find($id)->credentials['refresh_token']);
        $this->assertSame('connected', IntegrationConnection::query()->find($id)->status);
    }

    public function test_busy_provider_ends_attempt_instead_of_polling_forever(): void
    {
        $this->fakeProvider('gmail');
        [$id, $q] = $this->start('gmail');
        $lock = Cache::lock('integration:'.hash('sha256', $this->session->user_id.':google'), 30);
        $this->assertTrue($lock->get());
        try {
            $this->complete('gmail', $q);
            $this->rpc(['operation' => 'poll', 'id' => $id])->assertJsonPath('status', 'failed');
            Http::assertNothingSent();
        } finally {
            $lock->release();
        }
    }
}
