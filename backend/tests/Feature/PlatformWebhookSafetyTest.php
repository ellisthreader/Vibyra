<?php

namespace Tests\Feature;

use App\Jobs\DeliverPlatformWebhook;
use App\Models\{AccountAuditEvent, WebhookDelivery, WebhookEndpoint};
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Lifecycle, RunStates};
use App\Services\Mcp\EndpointPolicy;
use App\Services\Platform\{WebhookEndpoints, WebhookEvents, WebhookSender};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Tests\Support\{AgentV2Fixture, PlatformWebhookFixture};
use Tests\TestCase;

/** Roadmap Part 11: outbound webhook address safety, secrets, the portal routes, the sweeper and the flag. */
class PlatformWebhookSafetyTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, PlatformWebhookFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootWebhooks();
    }

    public function test_an_unsafe_address_is_refused_when_saved(): void
    {
        $make = fn (string $url) => $this->endpoint(['run.failed'], $url);
        foreach (['http://hooks.example.test/x', 'https://hooks.example.test:8443/x', 'https://127.0.0.1/x', 'https://[::1]/x',
            'https://user:pw@hooks.example.test/x', 'https://localhost/x', 'ftp://hooks.example.test/x'] as $url) {
            try { $make($url); $this->fail('Accepted '.$url); }
            catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame('blocked_destination', $e->getResponse()->getData(true)['code'], $url); }
        }
        foreach (['10.0.0.8', '169.254.169.254', '100.64.0.7', '192.168.1.5'] as $ip) {
            $this->lookup = [$ip];
            try { $make(self::URL); $this->fail('Accepted '.$ip); }
            catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame(422, $e->getResponse()->getStatusCode()); }
        }
        $this->assertSame(0, WebhookEndpoint::count());
        Http::assertNothingSent();
    }

    public function test_the_address_is_checked_again_at_delivery_and_redirects_are_not_followed(): void
    {
        Queue::fake();
        $this->endpoint(['run.failed']);
        $this->lookup = ['10.1.2.3']; // DNS now points inside the network
        Http::fake(['hooks.example.test/*' => Http::response('', 302, ['Location' => 'https://169.254.169.254/latest'])]);
        $this->move($this->newRun(), RunStates::FAILED);
        app(WebhookSender::class)->attempt(WebhookDelivery::sole()->id);
        Http::assertNothingSent();
        $this->assertSame('blocked_destination', WebhookDelivery::sole()->error);
        $this->lookup = ['93.184.216.34'];
        $d = WebhookDelivery::sole();
        $d->forceFill(['next_attempt_at' => now()->subSecond()])->save();
        app(WebhookSender::class)->attempt($d->id);
        $this->assertSame('redirect_blocked', $d->fresh()->error);
        Http::assertSentCount(1);
    }

    public function test_the_secret_is_encrypted_at_rest_listed_never_and_scoped_to_the_owner(): void
    {
        [$endpoint, $secret] = $this->endpoint();
        $this->assertStringStartsWith('whsec_vy_', $secret);
        $this->assertSame($secret, Crypt::decryptString(DB::table('webhook_endpoints')->value('secret')));
        $this->assertStringNotContainsString($secret, DB::table('webhook_endpoints')->get()->toJson());
        $this->actingAs($this->user);
        $this->withToken('')->getJson('/web-api/developer')->assertOk()->assertJsonCount(1, 'webhooks');
        $this->assertStringNotContainsString($secret, $this->withToken('')->getJson('/web-api/developer')->getContent());
        $stranger = \App\Models\User::factory()->create();
        $this->actingAs($stranger)->withToken('')->postJson('/web-api/developer/webhooks/'.$endpoint->id.'/pause', ['paused' => true])->assertNotFound();
        $this->deleteJson('/web-api/developer/webhooks/'.$endpoint->id)->assertNotFound();
        $this->getJson('/web-api/developer/webhooks/'.$endpoint->id.'/deliveries')->assertNotFound();
        $this->assertSame(['webhook.created'], AccountAuditEvent::pluck('event')->all());
    }

    public function test_portal_routes_create_pause_list_the_log_and_delete(): void
    {
        $this->actingAs($this->user)->withToken('');
        $r = $this->postJson('/web-api/developer/webhooks', ['url' => self::URL, 'events' => ['run.completed']])->assertCreated();
        $this->assertNotEmpty($r->json('secret'));
        $id = $r->json('webhook.id');
        $this->postJson('/web-api/developer/webhooks', ['url' => 'http://insecure.example.test', 'events' => ['run.completed']])->assertStatus(422)->assertJsonPath('code', 'blocked_destination');
        $this->postJson('/web-api/developer/webhooks', ['url' => self::URL, 'events' => ['run.exploded']])->assertStatus(422);
        $this->postJson('/web-api/developer/webhooks/'.$id.'/pause', ['paused' => true])->assertOk()->assertJsonPath('webhook.paused', true);
        $this->getJson('/web-api/developer/webhooks/'.$id.'/deliveries')->assertOk()->assertJsonCount(0, 'deliveries');
        $this->deleteJson('/web-api/developer/webhooks/'.$id)->assertOk();
        $this->getJson('/web-api/developer')->assertOk()->assertJsonCount(0, 'webhooks');
        $this->assertSame(['webhook.created', 'webhook.paused', 'webhook.deleted'], AccountAuditEvent::orderBy('id')->pluck('event')->all());
        config(['platform.webhooks' => false, 'platform.api_keys' => false]);
        $this->getJson('/web-api/developer')->assertNotFound();
    }

    public function test_the_sweeper_reoffers_due_deliveries_and_a_removed_endpoint_abandons_pending_ones(): void
    {
        Queue::fake();
        [$endpoint] = $this->endpoint(['run.failed']);
        Http::fake(['hooks.example.test/*' => Http::response('x', 500)]);
        $this->move($this->newRun(), RunStates::FAILED);
        $d = WebhookDelivery::sole();
        $d->forceFill(['next_attempt_at' => now()->addMinutes(5)])->save();
        $this->assertSame(0, app(WebhookSender::class)->sweep());
        $d->forceFill(['next_attempt_at' => now()->subSecond()])->save();
        $this->assertSame(1, app(WebhookSender::class)->sweep());
        app(WebhookEndpoints::class)->delete($this->user->id, $endpoint->id);
        $this->assertSame('abandoned', $d->fresh()->state);
        $this->assertSame(0, app(WebhookSender::class)->sweep());
        $this->move($this->newRun(), RunStates::FAILED);
        $this->assertSame(1, WebhookDelivery::count());
    }

    public function test_nothing_is_queued_while_the_flag_is_off(): void
    {
        $this->endpoint();
        config(['platform.webhooks' => false]);
        $this->move($this->newRun(), RunStates::FAILED);
        $this->assertSame(0, WebhookDelivery::count());
    }
}
