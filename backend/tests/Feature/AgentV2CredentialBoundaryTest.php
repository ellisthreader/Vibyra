<?php

namespace Tests\Feature;

use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\Connections\{Connections, Credentials};
use App\Services\AgentRuns\Tools\Providers\{ProviderHttp, ToolFailure};
use App\Services\ChatConnectors\Installs;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

class AgentV2CredentialBoundaryTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    public function test_google_and_bearer_requests_do_not_follow_credential_bearing_redirects(): void
    {
        Http::fake(['provider.test/*' => Http::response('', 302, ['Location' => 'https://other.test/'])]);
        foreach (['google', 'bearer', 'github'] as $factory) {
            $options = null;
            $response = ProviderHttp::$factory('fixture-token')->beforeSending(function ($request, $sent) use (&$options) {
                $options = $sent;
            })->get('https://provider.test/read');
            $this->assertSame(302, $response->status());
            $this->assertFalse($options['allow_redirects']);
        }
        Http::assertSentCount(3);
    }

    public function test_stale_standalone_generation_and_revocation_cannot_return_a_replacement_token(): void
    {
        $row = $this->standalone();
        $row->newQuery()->whereKey($row->id)->update(['generation' => 2, 'credential' => Crypt::encryptString('new-account-token')]);
        $this->assertChanged($row);
        $row = $row->fresh();
        $row->newQuery()->whereKey($row->id)->update(['revoked_at' => now(), 'health' => 'revoked']);
        $this->assertChanged($row);
        Http::assertNothingSent();
    }

    public function test_oauth_token_exchange_does_not_forward_secrets_to_a_redirect(): void
    {
        Http::fake(['auth.test/token' => Http::response('', 307, ['Location' => 'https://other.test/'])]);
        $options = null;
        \App\Services\ChatConnectors\ConnectorTokens::request([])->beforeSending(function ($request, $sent) use (&$options) {
            $options = $sent;
        })->post('https://auth.test/token', ['refresh_token' => 'fixture-refresh', 'client_secret' => 'fixture-secret']);
        $this->assertFalse($options['allow_redirects']);
        Http::assertSentCount(1);
    }

    public function test_legacy_replacement_before_sync_is_refused_by_identity_and_epoch(): void
    {
        $row = Connection::query()->findOrFail($this->gmailInstall('old@example.com'));
        DB::table('vibes_integration_installs')->where('id', $row->install_id)->update([
            'account_label' => 'replacement@example.com', 'credential' => Crypt::encryptString('replacement-token')]);
        $this->assertChanged($row);
        DB::table('vibes_integration_installs')->where('id', $row->install_id)->update([
            'account_label' => 'old@example.com', 'connected_at' => now()->addMinute()]);
        $this->assertChanged($row);
        Http::assertNothingSent();
    }

    public function test_same_second_legacy_reconnect_still_fences_the_old_generation(): void
    {
        $this->freezeTime();
        $row = Connection::query()->findOrFail($this->gmailInstall('owner@example.com'));
        Http::fake(['www.googleapis.com/oauth2/v3/userinfo' => Http::response(['email' => 'owner@example.com'])]);
        app(Installs::class)->connect($row->user_id, 'gmail', 'replacement');
        $this->assertSame(2, $row->fresh()->generation);
        $this->assertChanged($row);
        $this->assertSame('replacement', app(Credentials::class)->for($row->fresh()));
        \App\Services\AgentRuns\Connections\LegacyInstalls::sync($row->user_id);
        $this->assertSame(2, $row->fresh()->generation, 'Sync must not count that same reconnect again.');
    }

    public function test_deleted_install_id_cannot_resolve_a_new_install_for_the_same_person(): void
    {
        $row = Connection::query()->findOrFail($this->gmailInstall('old@example.com'));
        DB::table('vibes_integration_installs')->where('id', $row->install_id)->delete();
        DB::table('vibes_integration_installs')->insert(['user_id' => $row->user_id, 'integration' => 'gmail',
            'account_label' => 'old@example.com', 'credential' => Crypt::encryptString('new-token'),
            'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->assertChanged($row);
    }

    public function test_old_provider_failure_cannot_poison_a_reconnected_or_revoked_connection(): void
    {
        $row = $this->standalone();
        $row->newQuery()->whereKey($row->id)->update(['generation' => 2]);
        app(Connections::class)->markReconnect($row);
        app(Connections::class)->markScope($row, 'gmail_send');
        $this->assertSame('healthy', $row->fresh()->health);
        $this->assertNull($row->fresh()->scope_issue);
        $new = $row->fresh();
        $new->newQuery()->whereKey($new->id)->update(['revoked_at' => now(), 'health' => 'revoked']);
        app(Connections::class)->markReconnect($new);
        $this->assertSame('revoked', $new->fresh()->health);
    }

    public function test_hour_lifetime_tokens_are_reused_and_near_expiry_renews_only_once_on_both_paths(): void
    {
        config(['chat_connectors.catalogue.gmail.oauth.client_id' => 'test-client',
            'chat_connectors.catalogue.gmail.oauth.client_secret' => 'test-secret']);
        Http::fake(['oauth2.googleapis.com/token' => Http::response(['access_token' => 'renewed', 'expires_in' => 3600])]);
        $standalone = $this->standalone();
        $legacy = Connection::query()->findOrFail($this->gmailInstall('legacy@example.com', 'original'));
        $where = DB::table('vibes_integration_installs')->where('id', $legacy->install_id);
        $where->update(['refresh_token' => Crypt::encryptString('refresh'), 'expires_at' => now()->addHour()]);
        foreach ([$standalone, $legacy] as $row) $this->assertSame('original', app(Credentials::class)->for($row));
        Http::assertNothingSent();
        $standalone->forceFill(['expires_at' => now()->addMinute()])->save();
        $where->update(['expires_at' => now()->addMinute()]);
        foreach ([$standalone, $legacy] as $row) {
            $this->assertSame('renewed', app(Credentials::class)->for($row));
            $this->assertSame('renewed', app(Credentials::class)->for($row));
        }
        $this->assertSame('renewed', app(Installs::class)->credential($legacy->user_id, 'gmail'));
        Http::assertSentCount(2);
        $this->assertSame('refresh', Crypt::decryptString($standalone->fresh()->refresh_token));
    }

    public function test_sweeper_does_not_reconcile_an_old_write_using_a_new_connection_generation(): void
    {
        $id = $this->gmailInstall('owner@example.com');
        $this->grant($id, ['gmail_send']);
        $this->admit('Prepare a test message.');
        $claim = $this->claim();
        $action = $this->callTool($claim, 'gmail_send', $id,
            ['to' => 'qa@example.com', 'subject' => 'Test', 'body' => 'Approved body'], 'write')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update([
            'state' => 'dispatching', 'decision' => 'allow', 'dispatched_at' => now()->subMinutes(10), 'updated_at' => now()->subMinutes(10)]);
        DB::table('agent_runs')->where('id', $claim['id'])->update(['state' => 'running']);
        DB::table('agent_connections')->where('id', $id)->increment('generation');
        $stats = app(\App\Services\AgentRuns\Tools\DispatchSweeper::class)->sweep();
        $this->assertSame(1, $stats['unknown']);
        $this->assertSame('unknown', DB::table('agent_tool_actions')->where('id', $action['id'])->value('state'));
        Http::assertNothingSent();
    }

    private function standalone(): Connection
    {
        return Connection::query()->create(['user_id' => $this->user->id, 'provider' => 'gmail',
            'external_identity' => 'extra@example.com', 'generation' => 1, 'capability_revision' => 1,
            'health' => 'healthy', 'credential' => Crypt::encryptString('original'),
            'refresh_token' => Crypt::encryptString('refresh'), 'expires_at' => now()->addHour()]);
    }

    private function assertChanged(Connection $row): void
    {
        try {
            app(Credentials::class)->for($row);
            $this->fail('A stale connection returned a credential.');
        } catch (ToolFailure $failure) {
            $this->assertSame('access_changed', $failure->reason);
            $this->assertSame('refused', $failure->outcome);
        }
    }
}
