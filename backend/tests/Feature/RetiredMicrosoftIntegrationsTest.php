<?php

namespace Tests\Feature;

use App\Models\AgentV2\Connection;
use App\Services\AgentChannels\Gate;
use App\Services\AgentRuns\Connections\{Credentials, LegacyInstalls};
use App\Services\AgentRuns\Tools\Providers\ToolFailure;
use App\Services\ChatConnectors\{ConnectorOAuth, Installs, Registry, RetiredIntegrations};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\AgentV2Fixture;

final class RetiredMicrosoftIntegrationsTest extends \Tests\TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_removed_services_are_absent_and_cannot_be_connected_even_with_stale_configuration(): void
    {
        foreach (RetiredIntegrations::IDS as $provider) {
            config(['chat_connectors.catalogue.'.$provider => ['name' => $provider, 'oauth' => ['client_id' => 'stale', 'client_secret' => 'stale']]]);
            $this->assertFalse(app(Registry::class)->has($provider));
            $this->assertSame([], app(Registry::class)->definitions([$provider]));
            $this->assertFalse(app(ConnectorOAuth::class)->configured($provider));
            $this->assertNull(app(ConnectorOAuth::class)->renew($provider, 'expired'));
            $this->postJson('/api/agents/v2/connections', ['provider' => $provider, 'credential' => 'fixture'])->assertNotFound();
        }
        $providers = array_column($this->getJson('/api/agents/v2/catalogue')->assertOk()->json('providers'), 'provider');
        $this->assertSame([], array_values(array_intersect(RetiredIntegrations::IDS, $providers)));
        $this->assertContains('slack', $providers);
        $this->assertSame(['slack'], array_column(Gate::providers(), 'provider'));
        $this->assertFalse(Gate::configured('teams'));
        $this->postJson('/api/agents/v2/channel-hooks/teams', ['type' => 'message'])->assertStatus(405);
        Http::assertNothingSent();
    }

    public function test_stale_credentials_are_never_decrypted_refreshed_or_backfilled(): void
    {
        foreach (RetiredIntegrations::IDS as $provider) {
            $connection = Connection::create(['user_id' => $this->user->id, 'provider' => $provider,
                'credential' => 'deliberately-invalid-ciphertext', 'refresh_token' => 'invalid',
                'expires_at' => now()->subMinute(), 'generation' => 1, 'health' => 'healthy']);
            DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => $provider,
                'credential' => 'invalid', 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            try { app(Credentials::class)->for($connection); $this->fail('Retired credential was returned.'); }
            catch (ToolFailure $e) { $this->assertSame('provider_removed', $e->reason); }
            try { app(Installs::class)->credential($this->user->id, $provider); $this->fail('Retired install was returned.'); }
            catch (HttpException $e) { $this->assertSame(410, $e->getStatusCode()); }
        }
        LegacyInstalls::backfill($this->user->id);
        $this->assertSame(0, Connection::whereNotNull('install_id')->count());
        $listed = $this->getJson('/api/agents/v2/connections')->assertOk()->json('connections');
        $this->assertSame([], array_values(array_intersect(RetiredIntegrations::IDS, array_column($listed, 'provider'))));
        Http::assertNothingSent();
    }

    public function test_retirement_erases_credentials_and_revokes_grants_without_erasing_history_or_slack(): void
    {
        $ids = [];
        foreach ([...RetiredIntegrations::IDS, 'slack'] as $provider) {
            $c = Connection::create(['user_id' => $this->user->id, 'provider' => $provider,
                'credential' => Crypt::encryptString('fixture'), 'refresh_token' => Crypt::encryptString('refresh'),
                'expires_at' => now()->addHour(), 'generation' => 3, 'health' => 'healthy']);
            $ids[$provider] = $c->id;
            DB::table('agent_grants')->insert(['id' => (string) Str::uuid(), 'user_id' => $this->user->id,
                'agent_id' => $this->agent['id'], 'connection_id' => $c->id, 'operations' => json_encode([$provider.'_read']),
                'revision' => 2, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => $provider,
                'credential' => Crypt::encryptString('fixture'), 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        }
        $migration = require database_path('migrations/2026_10_11_010100_retire_microsoft_integrations.php');
        $migration->up();
        foreach (RetiredIntegrations::IDS as $provider) {
            $c = Connection::findOrFail($ids[$provider]);
            $this->assertNull($c->credential);
            $this->assertNull($c->refresh_token);
            $this->assertNull($c->expires_at);
            $this->assertNotNull($c->revoked_at);
            $this->assertSame(4, $c->generation);
            $grant = DB::table('agent_grants')->where('connection_id', $c->id)->sole();
            $this->assertNotNull($grant->revoked_at);
            $this->assertSame(3, $grant->revision);
        }
        $slack = Connection::findOrFail($ids['slack']);
        $this->assertNull($slack->revoked_at);
        $this->assertSame('fixture', Crypt::decryptString($slack->credential));
        $this->assertSame(['slack'], DB::table('vibes_integration_installs')->pluck('integration')->all());
        $this->assertDatabaseCount('agent_connections', 6);
        $migration->down();
        $this->assertNull(Connection::findOrFail($ids['teams'])->credential);
        Http::assertNothingSent();
    }
}
