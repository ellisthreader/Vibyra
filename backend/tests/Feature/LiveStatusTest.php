<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\LiveStatus\Card;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

final class LiveStatusTest extends TestCase
{
    use RefreshDatabase;

    private string $start = 'aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11';
    private string $card = 'bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22';

    protected function setUp(): void
    {
        parent::setUp();
        $key = openssl_pkey_new(self::openSslOptions(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]));
        openssl_pkey_export($key, $pem);
        config(['live_status.enabled' => true, 'live_status.apns.key' => $pem, 'live_status.apns.key_id' => 'TESTKEY123']);
    }

    private function token(): string
    {
        $user = User::factory()->create();
        $plain = "live-status-".$user->id;
        VibyraSession::create(["user_id" => $user->id, "token_hash" => hash("sha256", $plain),
            "idle_expires_at" => now()->addDay(), "absolute_expires_at" => now()->addDays(2)]);
        return $plain;
    }

    private function snap(array $attention = [], array $working = []): array
    {
        return ['name' => "Ellis's MacBook Air", 'attention' => $attention, 'working' => $working, 'recent' => []];
    }

    public function test_the_card_state_matches_the_swift_contract(): void
    {
        $s = Card::state(['attention' => [['key' => 't:1', 'title' => 'Fix login', 'project' => 'Vibyra', 'agent' => 'claude']], 'working' => [['key' => 't:2', 'title' => 'Tests', 'project' => '', 'agent' => 'codex']]], 1_800_000_000);
        $this->assertSame(['sessions' => 2, 'throughCloud' => false, 'checkedAt' => 1_800_000_000 - 978307200, 'working' => 1, 'needs' => 1,
            'phase' => 'needs', 'headline' => 'Fix login', 'project' => 'Vibyra', 'agent' => 'claude', 'others' => ['codex']], $s);
        $this->assertSame('Claude needs you', Card::alert($s)['title']);
        $this->assertSame('claudecode', Card::agent('Claude-Code/../'));
        $this->assertSame('idle', Card::state([], 0)['phase']);
        $this->assertLessThan(4096, strlen(json_encode(Card::start($s, str_repeat('M', 200), 0))));
    }

    public function test_a_busy_mac_starts_a_card_then_updates_alerts_once_and_ends_when_quiet(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $bearer = $this->token();
        $auth = ['Authorization' => "Bearer $bearer"];
        $this->putJson('/api/live-status/v1/phone', ['installId' => 'phone-1', 'startToken' => $this->start], $auth)->assertOk();
        $this->postJson('/api/live-status/v1/mac', $this->snap([], [['key' => 't:2', 'title' => 'Codex', 'project' => 'web']]), $auth)->assertOk();
        Http::assertSent(fn ($r) => str_contains($r->url(), $this->start) && $r['aps']['event'] === 'start'
            && $r['aps']['attributes-type'] === 'VibyraComputerAttributes' && $r['aps']['content-state']['phase'] === 'working'
            && $r->header('apns-push-type')[0] === 'liveactivity');

        // The phone reports the card's own token; from now on updates go there.
        $this->putJson('/api/live-status/v1/phone', ['installId' => 'phone-1', 'cardToken' => $this->card], $auth)->assertOk();
        $this->postJson('/api/live-status/v1/mac', $this->snap([['key' => 't:1', 'title' => 'Claude', 'project' => 'Vibyra', 'agent' => 'claude']]), $auth)->assertOk();
        Http::assertSent(fn ($r) => str_contains($r->url(), $this->card) && $r['aps']['event'] === 'update'
            && $r['aps']['content-state']['agent'] === 'claude'
            && $r['aps']['content-state']['phase'] === 'needs' && $r['aps']['alert']['title'] === 'Claude needs you'
            && $r->header('apns-priority')[0] === '10');

        // The same waiting item again: no second alert, and nothing changed so nothing is sent.
        $sent = count(Http::recorded());
        $this->postJson('/api/live-status/v1/mac', $this->snap([['key' => 't:1', 'title' => 'Claude', 'project' => 'Vibyra', 'agent' => 'claude']]), $auth)->assertOk();
        $this->assertSame($sent, count(Http::recorded()));

        // Quiet but inside the window: nothing is sent, so the card never reads "nothing running".
        $before = count(Http::recorded());
        $this->postJson('/api/live-status/v1/mac', $this->snap(), $auth)->assertOk();
        $this->assertSame($before, count(Http::recorded()));

        // Quiet past the idle window: the card ends.
        DB::table('live_status_snapshots')->update(['busy_at' => now()->subHour()]);
        $this->postJson('/api/live-status/v1/mac', $this->snap(), $auth)->assertOk();
        Http::assertSent(fn ($r) => str_contains($r->url(), $this->card) && $r['aps']['event'] === 'end');
        $this->assertNull(DB::table('live_status_phones')->value('card_token'));
    }

    public function test_a_sandbox_token_is_retried_once_on_the_sandbox_host_and_remembered(): void
    {
        Http::fake([
            'api.push.apple.com/*' => Http::response(['reason' => 'BadDeviceToken'], 400),
            'api.sandbox.push.apple.com/*' => Http::response('', 200),
        ]);
        $auth = ['Authorization' => 'Bearer '.$this->token()];
        $this->putJson('/api/live-status/v1/phone', ['installId' => 'p', 'startToken' => $this->start], $auth)->assertOk();
        $this->postJson('/api/live-status/v1/mac', $this->snap([], [['key' => 't:2', 'title' => 'Codex']]), $auth)->assertOk();
        $this->assertSame('sandbox', DB::table('live_status_phones')->value('apns_host'));
    }

    public function test_off_by_default_and_never_for_guests_or_strangers(): void
    {
        config(['live_status.enabled' => false]);
        $auth = ['Authorization' => 'Bearer '.$this->token()];
        $this->postJson('/api/live-status/v1/mac', $this->snap(), $auth)->assertStatus(503);
        config(['live_status.enabled' => true]);
        $this->postJson('/api/live-status/v1/mac', $this->snap())->assertStatus(401);
        $this->putJson('/api/live-status/v1/phone', ['installId' => 'p', 'startToken' => 'not-hex'], $auth)->assertStatus(422);
    }
}
