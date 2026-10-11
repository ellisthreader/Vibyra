<?php

namespace Tests\Feature\Teams;

use App\Models\VibyraSession;
use App\Services\Auth\DesktopProviderOAuthFlow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\TeamsSsoFixture;
use Tests\TestCase;

class TeamsProviderPolicyRaceTest extends TestCase
{
    use RefreshDatabase, TeamsSsoFixture;

    public function test_provider_collection_rechecks_new_sso_requirement_and_destroys_transient_token(): void
    {
        $this->bootSso();
        $this->configureSso(true, true);
        config([
            'services.google_desktop_oauth.client_id' => 'client',
            'services.google_desktop_oauth.client_secret' => 'secret',
            'services.google_desktop_oauth.redirect_uri' => 'https://example.test/callback',
        ]);
        $user = $this->person('ada@acme.test', ['provider' => 'google', 'provider_id' => 'google-ada']);
        $token = Str::random(72);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token),
            'device_name' => 'Vibyra Website', 'last_used_at' => now(),
            'idle_expires_at' => now()->addHour(), 'absolute_expires_at' => now()->addDay()]);
        $flows = app(DesktopProviderOAuthFlow::class);
        $this->withSession(['provider_flow_binding' => str_repeat('b', 48)]);
        $flow = $flows->start('google', ['deviceName' => 'Vibyra Website'], 'website:'.str_repeat('b', 48));
        $flows->finish($flow['flowId'], ['ok' => true, 'status' => 'complete', 'token' => $token,
            'user' => ['id' => $user->id], 'isNewUser' => false]);
        $this->getJson('/web-api/auth/provider/google/status/'.$flow['flowId'])->assertForbidden()->assertJsonPath('code', 'sso_required');
        $this->assertGuest();
        $this->assertDatabaseCount('vibyra_sessions', 0);
    }
}
